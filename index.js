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
    this.vDev = this.controller.devices.create({
        deviceId: "BlindControl_" + this.id,
        defaults: {
            metrics: {
                probeTitle: 'rain',
                title: langFile.title,
                level: 'off',
                icon: '/ZAutomation/api/v1/load/modulemedia/BlindControl/icon_norain.png'
            }
        },
        handler: function(command) {
            if (command === 'on' || command === 'off') {
                this.set('metrics:level',command);
            }
        },
        overlay: {
            deviceType: 'switchBinary'
        },
        moduleId: this.id
    });
    
};

BlindControl.prototype.stop = function () {
    var self = this;
    
    if (self.vDev) {
        self.controller.devices.remove(self.vDev.id);
        self.vDev = undefined;
    }
    
    BlindControl.super_.prototype.stop.call(this);
};

// ----------------------------------------------------------------------------
// --- Module methods
// ----------------------------------------------------------------------------

