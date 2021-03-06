/*** BlindControl Z-Way HA module *******************************************

Version: 1.08
(c) Maroš Kollár, 2015-2017
-----------------------------------------------------------------------------
Author: Maroš Kollár <maros@k-1.com>
Description:
    Manage blinds for optimal insulation and shading

******************************************************************************/

function BlindControl (id, controller) {
    // Call superconstructor first (AutomationModule)
    BlindControl.super_.call(this, id, controller);

    this.modes              = ['shade','insulation'];
    _.each(this.modes,function(type) {
        this[type+'Device'] = undefined;
    });

    this.insulationDevice   = undefined;
    this.interval           = undefined;
    this.sunDevice          = undefined;
    this.alarmCallback      = undefined;
    this.allDevices         = [];
}

inherits(BlindControl, BaseModule);

_module = BlindControl;

// ----------------------------------------------------------------------------
// --- Module instance initialized
// ----------------------------------------------------------------------------

BlindControl.prototype.init = function (config) {
    BlindControl.super_.prototype.init.call(this, config);

    var self = this;

    // Create vdev
    _.each(self.modes,function(type) {
        if (config[type+'Active'] === true) {
            self[type+'Device'] = this.controller.devices.create({
                deviceId: "BlindControl_"+type+'_'+ self.id,
                defaults: {
                    metrics: {
                        active: [],
                        title: self.langFile[type+'_active_label'],
                        level: 'off',
                        icon: self.imagePath+'/icon_'+type+'_off.png'
                    }
                },
                handler: _.bind(self.commandDevice,self,type),
                overlay: {
                    probeType: 'controller_blind_'+type,
                    deviceType: 'switchBinary'
                },
                moduleId: self.id
            });
        }
    });

    self.alarmCallback = _.bind(self.processAlarm,self);
    self.controller.on('security.smoke.alarm',self.alarmCallback);
    self.controller.on('security.smoke.stop',self.alarmCallback);

    self.interval = setInterval(_.bind(self.checkConditions,self),1000*60*3);
    setTimeout(_.bind(self.initCallback,self),1000*60*1);
};

BlindControl.prototype.stop = function () {
    var self = this;

    _.each(self.modes,function(type) {
        var key = type+'Device';
        if (typeof(self[key]) !== 'undefined') {
            self.controller.devices.remove(self[key].id);
            self[key] = undefined;
        }
    });

    if (typeof(self.interval) !== 'undefined') {
        clearInterval(self.interval);
        self.interval = undefined;
    }

    self.controller.off('security.smoke.alarm',self.alarmCallback);
    self.controller.off('security.smoke.stop',self.alarmCallback);

    self.alarmCallback = undefined;

    BlindControl.super_.prototype.stop.call(this);
};

BlindControl.prototype.initCallback = function() {
    var self = this;

    var devices = [];
    _.each(['insulation','shade'],function(type) {
        if (self.config[type+'Active'] === true) {
            var rules = self.config[type+'Rules'];
            _.each(rules,function(rule) {
                _.each(rule.devices,function(device) {
                    devices.push(device);
                });
            });
        }
    });

    self.allDevices = _.uniq(devices);
    console.log(self.allDevices);
    self.processDeviceList(self.allDevices,function(deviceObject) {
        var deviceAuto  = deviceObject.get('metrics:auto');
        if (typeof(deviceAuto) === 'undefined') {
            deviceObject.set('metrics:auto',false);
        } else if (deviceAuto === true) {
            var deviceLevel = deviceObject.get('metrics:level');
            if (deviceLevel >= 99) {
                deviceObject.set('metrics:auto',false);
            }
        }
    });
};

// ----------------------------------------------------------------------------
// --- Module methods
// ----------------------------------------------------------------------------

BlindControl.prototype.commandDevice = function(type,command) {
    var self = this;

    if (command !== 'on' && command !== 'off') return;

    self.log('Turn '+type+' blind control '+command);
    var device = self[type+'Device'];
    device.set('metrics:level',command);
    device.set('metrics:icon',self.imagePath+'/icon_'+type+'_'+command+'.png');

    if (command === 'on') {
        var otherType = (type === 'shade') ? 'insulation':'shade';
        var otherDevice = self[otherType+'Device'];
        if (typeof(otherDevice) !== 'undefined') {
            otherDevice.performCommand('off');
        }
    } else if (command === 'off') {
        var active = device.get('metrics:active',command);
        // TODO re-open all blinds?
        _.each(self.config[type+'Rules'],function(rule,ruleIndex) {
            if (active[ruleIndex] === true) {
                self.moveDevices(rule.devices,255);
            }
        });
        self[type+'Device'].set('metrics:active',[]);
    }
};

BlindControl.prototype.checkConditions = function() {
    var self = this;

    self.log('Evaluating blind positions');
    if (self.config.insulationActive === true &&
        self.insulationDevice.get('metrics:level') === 'on') {
        self.processInsulationRules();
    }
    if (self.config.shadeActive === true &&
        self.shadeDevice.get('metrics:level') === 'on') {
        self.processShadeRules();
    }
};

BlindControl.prototype.processInsulationRules = function() {
    var self = this;

    var rulesActive         = self.insulationDevice.get('metrics:active');
    var outsideTemperature  = self.getSensorData(self.config.temperatureOutsideSensor);
    var foreacastLow        = self.getSensorData(self.config.forecastLowSensor) || outsideTemperature;
    var temperature         = Math.min(outsideTemperature,foreacastLow);

    if (typeof(temperature) === 'undefined') {
        self.error('Could not find outside temperature or forecast sensor');
        return;
    }

    _.each(self.config.insulationRules,function(rule,ruleIndex) {
        var isActive        = rulesActive[ruleIndex] || false;
        var timeFrom        = self.parseTime(rule.timeFrom);
        var timeTo          = self.parseTime(rule.timeTo);
        var inPeriod        = self.checkPeriod(timeFrom,timeTo);
        var timeLimit       = new Date(timeFrom.getTime() + (timeFrom.getTime() - timeTo.getTime()) / 2);
        var inPeriodStart   = self.checkPeriod(timeFrom,timeLimit);
        var inTemperature   = temperature < rule.temperatureOutside;

        // Check sun altitude & temp
        if (inTemperature
            && inPeriod === true
            && isActive === false
            && inPeriodStart === true ) {
            self.log('Close blind for insulation');
            rulesActive[ruleIndex] = true;
            self.moveDevices(rule.devices,rule.position);
        } else if (inPeriod === false
            && isActive === true) {
            self.log('Open blind after insulation');
            rulesActive[ruleIndex] = false;
            self.moveDevices(rule.devices,255);
        } else {
            self.log('Nothing to do. temp: '+inTemperature+' active:'+isActive+' period:'+inPeriod+' ('+inPeriodStart+')');
            return;
        }

        self.insulationDevice.set('metrics:active',rulesActive);
    });
};

BlindControl.prototype.processShadeRules = function() {
    var self = this;

    var rulesActive         = self.shadeDevice.get('metrics:active');
    var sunAltitude         = self.getSunAltitude();
    var sunAzimuth          = self.getSunAzimuth();
    var outsideTemperature  = self.getSensorData(self.config.temperatureOutsideSensor);
    var forecastHigh        = self.getSensorData(self.config.forecastHighSensor) || outsideTemperature;
    var uvIndex             = self.getSensorData(self.config.uvSensor);
    var temperature         = Math.max(outsideTemperature,forecastHigh);

    if (typeof(temperature) === 'undefined') {
        self.error('Could not find outside temperature or forecast sensor');
        return;
    }

    _.each(self.config.shadeRules,function(rule,ruleIndex) {
        var matchClose          = true;
        var matchPosition       = true;
        var isActive            = rulesActive[ruleIndex] || false;
        var insideTemperature   = self.getSensorData(rule.temperatureInsideSensor);

        // Check outside temperature
        if (temperature < rule.temperatureOutside) {
            self.log('Zone '+ruleIndex+'. Outside temperature too low  ('+temperature+'). Not closing');
            matchClose = false;
        }

        // Check inside temperature
        if (typeof(rule.temperatureInside) !== 'undefined') {
            if (typeof(insideTemperature) === 'undefined') {
                self.error('Could not find inside temperature sensor');
                return;
            }
            if (insideTemperature < rule.temperatureInside) {
                self.log('Zone '+ruleIndex+'. Inside temperature too low ('+insideTemperature+'). Not closing');
                matchClose = false;
            }
        }

        // Check UV
        if (typeof(rule.sunUv) !== 'undefined') {
            if (typeof(uvIndex) === 'undefined') {
                self.error('Zone '+ruleIndex+'. Could not find UV sensor');
                return;
            }
            if (uvIndex < rule.sunUv) {
                self.log('Zone '+ruleIndex+'. UV Index too low ('+uvIndex+'). Not closing');
                matchClose = false;
            }
        }

        // Check solar altitude
        if (sunAltitude < rule.altitude) {
            self.log('Zone '+ruleIndex+'. Sun altitude too low ('+sunAltitude+'). Not closing');
            matchPosition = false;
        } else if (!
                (
                    (
                        (rule.azimuthLeft > rule.azimuthRight) &&
                        (sunAzimuth > rule.azimuthLeft || sunAzimuth < rule.azimuthRight)
                    )
                    ||
                    (
                        rule.azimuthLeft < rule.azimuthRight &&
                        sunAzimuth > rule.azimuthLeft &&
                        sunAzimuth < rule.azimuthRight
                    )
                )
            ) {
            self.log('Zone '+ruleIndex+'. Sun azimuth autside of range ('+sunAzimuth+'). Not closing');
            matchPosition = false;
        }

        // Check sun altitude
        if (matchClose === true
            && matchPosition === true
            && isActive === false) {
            // Close
            self.log('Zone '+ruleIndex+'. Closing');
            rulesActive[ruleIndex] = true;
            self.moveDevices(rule.devices,rule.position);
        } else if (matchPosition === false
            && isActive === true) {
            // Re-open
            self.log('Zone '+ruleIndex+'. Opening');
            rulesActive[ruleIndex] = false;
            self.moveDevices(rule.devices,255);
        } else {
            self.log('Zone '+ruleIndex+'. Nothing to do. active:'+isActive+' position:'+matchPosition+' close:'+matchClose);
            return;
        }
        self.shadeDevice.set('metrics:active',rulesActive);
    });
};

BlindControl.prototype.processAlarm = function(event) {
    var self = this;

    var alarmed = true;

    console.logJS(event);
    // TODO check event type
    self.controller.devices.each(function(vDev) {
        if (vDev.get('probeType') === 'controller_security'
            && vDev.get('metrics:securityType') === 'smoke') {
            var state = vDev.get('metrics:state');
            if (state !== 'alarm' && state !== 'timeout') {
                alarmed = false;
            }
        }
    });

    if (alarmed) {
        self.log('Opening all blinds due to smoke alarm');
    }

    self.processDeviceList(self.allDevices,function(deviceObject) {
        if (alarmed) {
            deviceObject.set('metrics:auto',true);
            deviceObject.performCommand('on');
        } else {
            deviceObject.set('metrics:auto',false);
        }
    });
};

BlindControl.prototype.moveDevices = function(devices,targetPos) {
    var self = this;

    self.log('Move devices to '+targetPos);

    self.processDeviceList(devices,function(deviceObject) {
        var deviceAuto  = deviceObject.get('metrics:auto');
        var devicePos   = deviceObject.get('metrics:target');
        if (typeof(devicePos) === 'undefined' || devicePos === null) {
            devicePos       = deviceObject.get('metrics:level');
        }

        // Open
        if (targetPos >= 99 && (devicePos >= 99 || deviceAuto === false)) {
            self.log('Ignoring device open. Already at '+devicePos+' or not auto');
            if (deviceAuto === true) {
                deviceObject.set('metrics:auto',false);
            }
            return;
        // Close
        } else if  (targetPos < 99 && (devicePos < 99 || deviceAuto === true)) {
            self.log('Ignoring device close. Already at '+devicePos+' or auto');
            return;
        }

        self.log('Auto move blind '+deviceObject.id+' to '+targetPos);
        if (targetPos === 0) {
            deviceObject.set('metrics:auto',true);
            deviceObject.performCommand('off');
        } else if (targetPos >= 99) {
            deviceObject.set('metrics:auto',false);
            deviceObject.performCommand('on');
        } else {
            deviceObject.set('metrics:auto',true);
            deviceObject.performCommand('exact',{ level: targetPos });
        }
    });
};

BlindControl.prototype.getSunAzimuth = function() {
    var self = this;
    return self.getDeviceValue([
        ['probeType','=','astronomy_sun_altitude']
    ],'metrics:azimuth');
};

BlindControl.prototype.getSunAltitude = function() {
    var self = this;
    return self.getDeviceValue([
        ['probeType','=','astronomy_sun_altitude']
    ],'metrics:altitude');
};

BlindControl.prototype.getSensorData = function(deviceId) {
    var self = this;

    if (typeof(deviceId) === 'undefined') {
        return;
    }
    var deviceObject = self.controller.devices.get(deviceId);
    if (deviceObject === null) {
        return;
    }
    return deviceObject.get('metrics:level');
};