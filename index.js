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

    this.interval       = undefined;
    this.sunDevice      = undefined;
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
    self.vDev = this.controller.devices.create({
        deviceId: "BlindControl_" + self.id,
        defaults: {
            metrics: {
                probeTitle: 'rain',
                title: langFile.title,
                level: 'off',
                icon: '/ZAutomation/api/v1/load/modulemedia/BlindControl/icon_off.png'
            }
        },
        handler: function(command) {
            if (command === 'on' || command === 'off') {
                this.set('metrics:level',command);
                this.set('metrics:icon','/ZAutomation/api/v1/load/modulemedia/BlindControl/icon_'+command+'.png');
            }
        },
        overlay: {
            deviceType: 'switchBinary'
        },
        moduleId: self.id
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

BlindControl.prototype.checkConditions = function() {
    var self = this;

    if (self.vDev.get('metrics:level') === 'off') {
        return;
    }
    console.log('[BlindControl] Evaluating blind positions');
    
    // TODO based on dev status
    if (self.config.insulation_active) {
        self.processInsulationRules();
    }
    
    if (self.config.shade_active) {
        //self.processShadeRules();
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
        }
        // TODO check azi
        
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
/*
     "azimuth_left": {
        "type": "number",
        "required": true,
        "minimum": 0,
        "maximum": 360
     },
     "azimuth_right": {
        "type": "number",
        "required": true,
        "minimum": 0,
        "maximum": 360
     },
*/
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

