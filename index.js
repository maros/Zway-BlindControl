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

    var outsideTemperature = self.getSensorData('outside_temperature');
    if (typeof(outsideTemperature) === 'undefined') {
        console.error('[BlindControl] Could not find outside temperature sensor');
        return;
    }

    // Handle winter blinds insulation
    if (self.config.insulation_active) {
        _.each(self.config.insulation_rules,function(rule) {
            if (rule.temperature_outside > outsideTemperature) {
                self.processInsulationRule(rule);
            }
        });
    }

    // Handle summer blinds shade
    if (self.config.shade_active) {
        _.each(self.config.shade_rules,function(rule) {
            if (rule.temperature_outside < outsideTemperature) {
                self.processShadeRule(rule);
            }
        });
    }
};

BlindControl.prototype.processInsulationRule = function(rule) {
    var self = this;
    
    // Check sun altitude
    if (rule.altitude < self.getSunAltitude()) {
        // Close
        _.each(rule.devices,function(deviceId) {
            self.moveDevice(deviceId,rule.position);
        });
    } else {
        // Re-open
        _.each(rule.devices,function(deviceId) {
            self.moveDevice(deviceId,0);
        });
    }
};

BlindControl.prototype.processShadeRule = function(rule) {
    var self = this;
    
    // Check inside temperature
    if (typeof(rule.temperature_inside) !== 'undefined') {
        var insideTemperature = self.getSensorData('inside_temperature');
        if (typeof(insideTemperature) === 'undefined') {
            console.error('[BlindControl] Could not find inside temperature sensor');
            return;
        }
        if (insideTemperature < rule.temperature_inside) {
            return;
        }
    }
    
    // Check UV
    if (typeof(rule.sun_uv) !== 'undefined') {
        var uvIndex = self.getSensorData('uv');
        if (typeof(uvIndex) === 'undefined') {
            console.error('[BlindControl] Could not find UV sensor');
            return;
        }
        if (uvIndex < rule.sun_uv) {
            return;
        }
    }
    
    // Check sun altitude
    if (rule.altitude > self.getSunAltitude()) {
        // Close
        _.each(rule.devices,function(deviceId) {
            self.moveDevice(deviceId,rule.position);
        });
    } else {
        // Re-open
        _.each(rule.devices,function(deviceId) {
            self.moveDevice(deviceId,0);
        });
    }
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


BlindControl.prototype.moveDevice = function(deviceId,position) {
    var self = this;
    var deviceObject = self.controller.devices.get(deviceId);
    if (typeof(deviceObject) === 'undefined') {
        console.error('[BlindControl] Could not find blinds device '+deviceId);
        return;
    }
    if (position === 0
        && deviceObject.get('metrics:auto') === false) {
        return;
    }
    console.error('[BlindControl] Auto move blint '+deviceId+' to '+position);
    deviceObject.set('metrics:auto',(position >= 99 ? false:true));
    deviceObject.performCommand('exact',{ level: position });
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
            var deviceType =  vDev.get('deviceType');
            if (deviceType === 'sensorMultilevel'
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

