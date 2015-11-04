/*** BlindControl Z-Way HA module *******************************************

Version: 1.01
(c) Maroš Kollár, 2015
-----------------------------------------------------------------------------
Author: Maroš Kollár <maros@k-1.com>
Description:
    Manage blinds for optimal insulation and shading 

******************************************************************************/

function BlindControl (id, controller) {
    // Call superconstructor first (AutomationModule)
    BlindControl.super_.call(this, id, controller);

    this.shadeDevice        = undefined;
    this.insulationDevice   = undefined;
    this.interval           = undefined;
    this.sunDevice          = undefined;
}

inherits(BlindControl, AutomationModule);

_module = BlindControl;

// ----------------------------------------------------------------------------
// --- Module instance initialized
// ----------------------------------------------------------------------------

BlindControl.prototype.init = function (config) {
    BlindControl.super_.prototype.init.call(this, config);

    var self = this;
    var langFile = self.controller.loadModuleLang("BlindControl");
    
    
    // TODO one winter one summer dev
    // Create vdev
    _.each(['shade','insulation'],function(type) {
        if (self.config[type+'_active'] === true) {
            self[type+'_device'] = this.controller.devices.create({
                deviceId: "BlindControl_"+type+'_'+ self.id,
                defaults: {
                    metrics: {
                        probeTitle: 'controller',
                        title: langFile[type+'_active_label'],
                        level: 'off',
                        icon: '/ZAutomation/api/v1/load/modulemedia/BlindControl/icon_'+type+'_off.png'
                    }
                },
                handler: _.bind(self.commandDevice,self,type),
                overlay: {
                    deviceType: 'switchBinary'
                },
                moduleId: self.id
            });
        }
    });
    
    self.interval = setInterval(_.bind(self.checkConditions,self),1000*60*3);
};

BlindControl.prototype.stop = function () {
    var self = this;
    
    if (self.vDev) {
        self.controller.devices.remove(self.vDev.id);
        self.vDev = undefined;
    }
    
    if (typeof(self.interval) !== 'undefined') {
        clearInterval(self.interval);
        self.interval = undefined;
    }
    
    BlindControl.super_.prototype.stop.call(this);
};

// ----------------------------------------------------------------------------
// --- Module methods
// ----------------------------------------------------------------------------

BlindControl.prototype.commandDevice = function(type,command) {
    var self = this;
    
    if (command === 'on' || command === 'off') {
        self[type+'Device'].set('metrics:level',command);
        self[type+'Device'].set('metrics:icon','/ZAutomation/api/v1/load/modulemedia/BlindControl/icon_'+type+'_'+command+'.png');
    }
    if (command === 'on') {
        var otherType = (type === 'shade') ? 'insulation':'shade';
        if (self.config[otherType+'_active'] !== 'undefined') {
            self[otherType+'Device'].performCommand('off');
        }
    }
};

BlindControl.prototype.checkConditions = function() {
    var self = this;

    console.log('[BlindControl] Evaluating blind positions');
    if (self.config.insulation_active
        && self.insulationDevice.get('metrics:level') === 'on') {
        self.processInsulationRules();
    }
    if (self.config.shade_active
        && self.shadeDevice.get('metrics:level') === 'on') {
        self.processShadeRules();
    }
};

BlindControl.prototype.processInsulationRules = function() {
    var self = this;
    
    var sunAltitude         = self.getSunAltitude();
    var outsideTemperature  = self.getSensorData('temperature_outside');
    if (typeof(outsideTemperature) === 'undefined') {
        console.error('[BlindControl] Could not find outside temperature sensor');
        return;
    }
    
    _.each(self.config.insulation_rules,function(rule) {
        console.log('[BlindControl] Process rule');
        console.logJS(rule);
        // Check sun altitude & temp
        if (outsideTemperature < rule.temperature_outside
            && sunAltitude < rule.altitude) {
            self.moveDevices(rule.devices,rule.position);
        } else if (sunAltitude > rule.altitude) {
            self.moveDevices(rule.devices,0);
        }
    });
};

BlindControl.prototype.processShadeRules = function() {
    var self = this;
    
    var sunAltitude         = self.getSunAltitude();
    var sunAzimuth          = self.getSunAzimuth();
    var outsideTemperature  = self.getSensorData('temperature_outside');
    var insideTemperature   = self.getSensorData('temperature_inside');
    var uvIndex             = self.getSensorData('uv');
    if (typeof(outsideTemperature) === 'undefined') {
        console.error('[BlindControl] Could not find outside temperature sensor');
        return;
    }
    
    _.each(self.config.shade_rules,function(rule) {
        var matchClose      = true;
        var matchPosition   = true;
        
        if (outsideTemperature < rule.temperature_outside) {
            matchClose = false;
        }
        
        // Check inside temperature
        if (typeof(rule.temperature_inside) !== 'undefined') {
            if (typeof(insideTemperature) === 'undefined') {
                console.error('[BlindControl] Could not find inside temperature sensor');
                return;
            }
            if (insideTemperature < rule.temperature_inside) {
                matchClose = false;
            }
        }
        
        // Check UV
        if (typeof(rule.sun_uv) !== 'undefined') {
            
            if (typeof(uvIndex) === 'undefined') {
                console.error('[BlindControl] Could not find UV sensor');
                return;
            }
            if (uvIndex < rule.sun_uv) {
                matchClose = false;
            }
        }
        
        if (sunAltitude < rule.altitude) {
            matchPosition = false;
        } else if (
                (
                    rule.azimuth_left < rule.azimuth_right
                    && (sunAzimuth < shade.azimuth_left || sunAzimuth > rule.azimuth_right)
                )
                ||
                (
                    rule.azimuth_left > rule.azimuth_right
                    && sunAzimuth > rule.azimuth_left
                    && sunAzimuth < rule.azimuth_right
                )
            ) {
            matchPosition = false;
        }
        
        // Check sun altitude
        if (matchClose === true
            && matchPosition === true) {
            // Close
            _.each(rule.devices,function(deviceId) {
                self.moveDevice(deviceId,rule.position);
            });
        } else if (matchPosition === false) {
            // Re-open
            _.each(rule.devices,function(deviceId) {
                self.moveDevice(deviceId,0);
            });
        }
    });
};

BlindControl.prototype.moveDevices = function(devices,position) {
    var self = this;
    
    _.each(devices,function(deviceId) {
        var deviceObject = self.controller.devices.get(deviceId);
        if (typeof(deviceObject) === 'undefined') {
            console.error('[BlindControl] Could not find blinds device '+deviceId);
            return;
        }
        var deviceAuto = deviceObject.get('metrics:auto');
        if ((position === 0 && deviceAuto === false) || (position > 0 && deviceAuto === true)) {
            return;
        }
        console.error('[BlindControl] Auto move blint '+deviceId+' to '+position);
        if (position === 0) {
            deviceObject.set('metrics:auto',false);
            deviceObject.performCommand('on');
        } else if (position > 99) {
            deviceObject.set('metrics:auto',true);
            deviceObject.performCommand('off');
        } else {
            deviceObject.set('metrics:auto',true);
            deviceObject.performCommand('exact',{ level: position });
        }
    });
};

BlindControl.prototype.getSunAzimuth = function() {
    var self = this;
    var sunDevice = self.getSunDevice();
    return sunDevice.get('metrics:azimuth');
};

BlindControl.prototype.getSunAltitude = function() {
    var self = this;
    var sunDevice = self.getSunDevice();
    return sunDevice.get('metrics:altitude');
};

BlindControl.prototype.getSunDevice = function() {
    var self = this;

    if (typeof(self.sunDevice) === 'undefined') {
        self.controller.devices.each(function(vDev) {
            if (vDev.get('deviceType') === 'sensorMultilevel'
                && vDev.get('metrics:probeTitle') === 'astronomy') {
                self.sunDevice = vDev;
            }
        });
    }
    
    if (typeof(self.sunDevice) === 'undefined') {
        console.error('[BlindControl] Could not find astronomy device');
    }
    
    return self.sunDevice;
};

BlindControl.prototype.getSensorData = function(type) {
    var self = this;

    var deviceId = self.config[type+'_sensor'];
    if (typeof(deviceId) === 'undefined') {
        return;
    }
    var device = self.controller.devices.get(deviceId);
    if (typeof(device) === 'undefined') {
        return;
    }
    return device.get('metrics:level');
}

