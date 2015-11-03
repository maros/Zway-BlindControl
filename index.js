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

    this.interval      = undefined;
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
            if (rule.temperature_outside > outsideTemperature) {
                self.processShadeRule(rule);
            }
        });
    }
};

BlindControl.prototype.processInsulationRule = function(rule) {
    var self = this;
    // TODO
};

BlindControl.prototype.processShadeRule = function(rule) {
    var self = this;
    // TODO
    var insideTemperature  = self.getSensorData('inside_temperature');
    
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

