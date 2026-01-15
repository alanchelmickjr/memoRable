#!/bin/bash
# Get location for MemoRable
# GPS requires: System Preferences > Privacy > Location Services > Terminal
# Until then, IP geolocation works

# Quick IP geolocation (city-level, ~5km accuracy)
curl -s "http://ip-api.com/json/" | jq -c '{lat,lon,city,region:.regionName,source:"ip",accuracy:5000}'

# To enable GPS:
# 1. System Preferences > Privacy & Security > Location Services
# 2. Enable for Terminal (or iTerm)
# 3. Then locateme will work: locateme -f '{"lat":%LAT,"lon":%LON}'
