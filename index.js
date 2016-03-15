/*** BlindControl Z-Way HA module *******************************************

Version: 1.04
(c) Maroš Kollár, 2015
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
                    probeType: 'BlindController',
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
    setTimeout(_.bind(self.initCallback,self),1000*60);
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
    _.each(self.config.insulationRules,function(rule) {
        devices.push(rule.devices);
    });
    _.each(self.config.shadeRules,function(rule) {
        devices.push(rule.devices);
    });
    
    self.allDevices = _.uniq(_.flatten(devices));
    
    self.processDeviceList(self.allDevices,function(deviceObject) {
        var deviceAuto  = deviceObject.get('metrics:auto');
        if (typeof(deviceAuto) === 'undefined') {
            deviceObject.set('metrics:auto',false);
        } else if (deviceAuto === true) {
            var deviceLevel = deviceObject.get('metrics:level');
            if (deviceLevel > 99) {
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
    
    self[type+'Device'].set('metrics:level',command);
    self[type+'Device'].set('metrics:icon',self.imagePath+'/icon_'+type+'_'+command+'.png');
    
    if (command === 'on') {
        var otherType = (type === 'shade') ? 'insulation':'shade';
        if (typeof(self[otherType+'Device']) !== 'undefined') {
            self[otherType+'Device'].performCommand('off');
        }
    } else if (command === 'off') {
        self[type+'Device'].set('metrics:active',[]);
    }
};

BlindControl.prototype.checkConditions = function() {
    var self = this;

    self.log('Evaluating blind positions');
    if (self.config.insulationActive && 
        self.insulationDevice.get('metrics:level') === 'on') {
        self.processInsulationRules();
    }
    if (self.config.shadeActive && 
        self.shadeDevice.get('metrics:level') === 'on') {
        self.processShadeRules();
    }
};

BlindControl.prototype.processInsulationRules = function() {
    var self = this;
    
    var rulesActive         = self.insulationDevice.get('metrics:active');
    var outsideTemperature  = self.getSensorData('temperatureOutside');
    var foreacastLow        = self.getSensorData('forecastLow') || outsideTemperature;
    var temperature         = Math.min(outsideTemperature,foreacastLow);
    
    if (typeof(temperature) === 'undefined') {
        self.error('Could not find outside temperature or forecast sensor');
        return;
    }
    
    _.each(self.config.insulationRules,function(rule,ruleIndex) {
        var inPeriod    = self.checkPeriod(rule.timeFrom,rule.timeTo);
        var isActive    = rulesActive[ruleIndex] || false;
        
        // Check sun altitude & temp
        if (temperature < rule.temperatureOutside 
            && inPeriod === true
            && isActive === false) {
            self.log('Close blind for insulation');
            rulesActive[ruleIndex] = true;
            self.moveDevices(rule.devices,rule.position);
        } else if (inPeriod === false
            && isActive === true) {
            self.log('Open blind after insulation');
            rulesActive[ruleIndex] = false;
            self.moveDevices(rule.devices,255);
        } else {
            self.log('Nothing to do. active:'+isActive+' period:'+inPeriod+' temp:'+temperature);
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
    var outsideTemperature  = self.getSensorData('temperatureOutside');
    var forecastHigh        = self.getSensorData('forecastHigh') || outsideTemperature;
    var insideTemperature   = self.getSensorData('temperatureInside');
    var uvIndex             = self.getSensorData('uv');
    var temperature         = Math.max(outsideTemperature,forecastHigh);
    
    if (typeof(temperature) === 'undefined') {
        self.error('Could not find outside temperature or forecast sensor');
        return;
    }
    
    _.each(self.config.shadeRules,function(rule,ruleIndex) {
        var matchClose      = true;
        var matchPosition   = true;
        var isActive        = rulesActive[ruleIndex] || false;
        
        // Check outside temperature
        if (temperature < rule.temperatureOutside) {
            matchClose = false;
        }
        
        // Check inside temperature
        if (typeof(rule.temperatureInside) !== 'undefined') {
            if (typeof(insideTemperature) === 'undefined') {
                self.error('Could not find inside temperature sensor');
                return;
            }
            if (insideTemperature < rule.temperatureInside) {
                matchClose = false;
            }
        }
        
        // Check UV
        if (typeof(rule.sunUv) !== 'undefined') {
            if (typeof(uvIndex) === 'undefined') {
                self.error('Could not find UV sensor');
                return;
            }
            if (uvIndex < rule.sunUv) {
                matchClose = false;
            }
        }
        
        // Check solar altitude
        if (sunAltitude < rule.altitude) {
            matchPosition = false;
        } else if (
                (
                    rule.azimuthLeft < rule.azimuthRight && 
                    (sunAzimuth < shade.azimuthLeft || sunAzimuth > rule.azimuthRight)
                ) ||
                (
                    rule.azimuthLeft > rule.azimuthRight && 
                    sunAzimuth > rule.azimuthLeft && 
                    sunAzimuth < rule.azimuthRight
                )
            ) {
            matchPosition = false;
        }
        
        // Check sun altitude
        if (matchClose === true
            && matchPosition === true
            && rulesActive[ruleIndex] === false) {
            // Close
            rulesActive[ruleIndex] = true;
            self.moveDevices(rule.devices,rule.position);
        } else if (matchPosition === false
            && rulesActive[ruleIndex] === true) {
            // Re-open
            rulesActive[ruleIndex] = false;
            self.moveDevices(rule.devices,255);
        } else {
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
        if (vDev.get('probeType') === 'SecurityZone'
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
        var devicePos   = deviceObject.get('metrics:level');
        
        // Open
        if (targetPos >= 99 && (devicePos >= 99 || deviceAuto === false)) {
            if (deviceAuto === true) {
                //deviceObject.set('metrics:auto',false);
            }
            return;
        // Close
        } else if  (targetPos < 99 && (devicePos < 99 || deviceAuto === true)) {
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
        ['metrics:probeTitle','=','Astronomy']
    ],'metrics:azimuth');
};

BlindControl.prototype.getSunAltitude = function() {
    var self = this;
    return self.getDeviceValue([
        ['metrics:probeTitle','=','Astronomy']
    ],'metrics:altitude');
};

BlindControl.prototype.getSensorData = function(type) {
    var self = this;

    var deviceId = self.config[type+'Sensor'];
    if (typeof(deviceId) === 'undefined') {
        return;
    }
    var deviceObject = self.controller.devices.get(deviceId);
    if (deviceObject === null) {
        return;
    }
    return deviceObject.get('metrics:level');
};