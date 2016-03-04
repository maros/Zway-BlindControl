# Zway-BlindControl

Manages blinds and shades for optimal shading when hot, and insulation when
cold. A virtual device will be created for each selected operations mode,
that can fully disable blind control actions.

It is possible to create multiple rules that manage several devices (eg. in 
different rooms). Rules can be created based on

* Inside temperature
* Outside temperature
* Solar intensity (UV Index)
* Solar altitude
* Solar azimuth

The module supports two operation modes: Shading and insulation. For shading
blinds will be closed once all preconditions (in- and outside temperature and
solar intensity) match, and the sun shines into a particular window
(calculated based on altitude and azimuth). The blinds will stay closed until
the sun has moved out of the slected area (regardless of the temperature) - 
either because it set below the selected altitude, or because it does not 
match the selected azimuth angles.

In insulation mode the blinds will be 
closed if the temperature and the altitude fall below a certain level. Blinds 
will be reopened once the solar altitude rises above the selected level.

# Configuration

This module depends on the Astronomy module from 
https://github.com/maros/Zway-Astronomy for calculating the solar position.

## shade_active

Configures if shading management should be activated.

## shade_rules

A list of all rules/devices that should be managed. All selected conditions
must match for the blinds to be closed.

## shade_rules.temperature_outside

If the outside temperature rises above the selected level, this rule will
be activated (optional)

## shade_rules.temperature_inside

If the inside temperature rises above the selected level, this rule will
be activated (optional)

## shade_rules.sun_uv

If the UV index rises above the selected level, this rule will
be activated (optional).

## shade_rules.azimuth_left, shade_rules.azimuth_right

Select two azimuth levels (0-360°). Rule will be activated if sun is between 
these two angles.

## shade_rules.altitude

Activate rule if sun rises above the selected altitude. (0-90°)

## shade_rules.devices

A list of all blinds and shades managed by this rule

## shade_rules.position

Desired closing position (0-99)

## insulation_active

Sets if low-temperature shade insulation mode should be activated.

## insulation_rules

A list of all rules/devices that should be managed. All selected conditions
must match for the blinds to be closed.

## insulation_rules.temperature_outside

If the outside temperature falls below the selected level, this rule will
be activated (optional)

## insulation_rules.altitude

Activate rule if sun falls below the selected altitude.

## insulation_rules.devices

A list of all blinds and shades managed by this rule.

## insulation_rules.position

Desired closing position (0-99)

## uv_sensor

Device that measures the UV index. Can be either a physical device (eg. Aeon
Labs Multisensor Gen 5) or a virtual device created by the WeatherUnderground
module ( https://github.com/maros/Zway-WeatherUnderground )

## temperature_outside_sensor

Device that measures the outside temperature. Can be either a physical device
or a virtual device created by any weather module 
(eg. https://github.com/maros/Zway-WeatherUnderground )

## temperature_inside_sensor

Device that measures the inside temperature. If you want to use the average
temperature of multiple sensors, you can use the SummarySensor module 
( https://github.com/maros/Zway-SummarySensor )

# Virtual Devices

This module creates two virtual binary that enables/disabled the shade and
insulation behaviour. The devices will only be created if the respective
rules are enabled in the configuration.

# Events

No events are emitted.

Blind controller always listens to security.smoke.alarm and 
security.smoke.cancel events (these events are usually emitted by 
( https://github.com/maros/Zway-SecurityZone ). In case of a smoke alarm all 
blinds managed by the controller are automatically opened.

# Installation

Make sure that the Astronomy module and BaseModule is installed prior to 
installing this module ( https://github.com/maros/Zway-Astronomy and 
https://github.com/maros/Zway-BaseModule)

The prefered way of installing this module is via the "Zwave.me App Store"
available in 2.2.0 and higher. For stable module releases no access token is 
required. If you want to test the latest pre-releases use 'k1_beta' as 
app store access token.

For developers and users of older Zway versions installation via git is 
recommended.

```shell
cd /opt/z-way-server/automation/userModules
git clone https://github.com/maros/Zway-BlindControl.git BlindControl --branch latest
```

To update or install a specific version
```shell
cd /opt/z-way-server/automation/userModules/BlindControl
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
