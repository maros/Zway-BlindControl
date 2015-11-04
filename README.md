# Zway-BlindControl

TODO

# Configuration

## shade_active

## shade_rules

## shade_rules.temperature_outside

## shade_rules.temperature_inside

## shade_rules.sun_uv

## shade_rules.azimuth_left, shade_rules.azimuth_right

## shade_rules.altitude

## shade_rules.devices

## shade_rules.position

## insulation_active

## insulation_rules

## insulation_rules.temperature_outside

## insulation_rules.altitude

## insulation_rules.devices

## insulation_rules.position

## uv_sensor

Device that measures the UV index. Can be either a physical device (eg. AeonLabs
Multisensor) or a virtual device created by the WeatherUnderground module
((https://github.com/maros/Zway-WeatherUnderground))

## temperature_outside_sensor

Device that measures the outside temperature. Can be either a physical device
or a virtual device created by a weather module 
(eg. (https://github.com/maros/Zway-WeatherUnderground))

## temperature_inside_sensor

Device that easures the inside temperature.

# Virtual Devices

This module creates two virtual binary that enables/disabled the shade and
insulation behaviour. The devices will only be created if the respective
rules are enabled in the configuration

# Events

No events are emitted.

Blind controller always listens to security.smoke.alarm and 
security.smoke.cancel events (these events are usually emitted by 
(https://github.com/maros/Zway-SecurityZone). In case of a smoke alarm all 
blinds managed by the controller are automatically opened.

# Installation

```shell
cd /opt/z-way-server/automation/modules
git clone https://github.com/maros/Zway-BlindControl.git BlindControl --branch latest
```

To update or install a specific version
```shell
cd /opt/z-way-server/automation/modules/BlindControl
git fetch --tags
# For latest released version
git checkout tags/latest
# For a specific version
git checkout tags/1.02
# For development version
git checkout -b master --track origin/master
```

# License

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or any 
later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU General Public License for more details.
