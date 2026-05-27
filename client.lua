local display   = false  
local hasFocus  = false  

local function setFishFinderVisible(state)
    display  = state
    hasFocus = state

    SendNUIMessage({
        type = "toggle",
        show = state
    })

    SetNuiFocus(state, state) 
end


RegisterCommand("fishfinder", function()
    setFishFinderVisible(not display)
end, false)


RegisterNUICallback("close", function(data, cb)
    display  = false
    hasFocus = false

    SendNUIMessage({
        type = "toggle",
        show = false
    })

    SetNuiFocus(false, false)
    cb("ok")
end)


RegisterNUICallback("escape", function(data, cb)
    hasFocus = false
    SetNuiFocus(false, false)   
    cb("ok")
end)


local function getDepthInfo()
    local ped = PlayerPedId()
    if not IsPedInAnyVehicle(ped, false) then
        return nil
    end

    local veh = GetVehiclePedIsIn(ped, false)
    if veh == 0 then
        return nil
    end

    
    if GetVehicleClass(veh) ~= 14 then
        return nil
    end

    local coords = GetEntityCoords(veh)
    local hasWater, waterHeight = GetWaterHeight(coords.x, coords.y, coords.z)

    if not hasWater then
        return nil
    end

    
    local startZ = waterHeight + 5.0
    local endZ   = waterHeight - 200.0

    local rayHandle = StartShapeTestRay(
        coords.x, coords.y, startZ,
        coords.x, coords.y, endZ,
        1, 
        veh,
        0
    )

    local _, hit, hitCoords = GetShapeTestResult(rayHandle)
    local bottomZ

    if hit == 1 and hitCoords then
        bottomZ = hitCoords.z
    else
        local found, groundZ = GetGroundZFor_3dCoord(coords.x, coords.y, coords.z, false)
        if found then
            bottomZ = groundZ
        else
            bottomZ = coords.z - 50.0
        end
    end

    if not bottomZ then
        return nil
    end

    local depthMeters = waterHeight - bottomZ
    if depthMeters < 0.0 then
        depthMeters = 0.0
    end

    local depthFeet = depthMeters * 3.28084
    local speedMps  = GetEntitySpeed(veh)
    local speedMph  = speedMps * 2.23694

    return {
        depthFeet = depthFeet,
        speedMph  = speedMph
    }
end


CreateThread(function()
    while true do
        if display then
            local info = getDepthInfo()

            if info then
                local depthRounded = math.floor(info.depthFeet * 10.0 + 0.5) / 10.0
                local speedRounded = math.floor(info.speedMph * 10.0 + 0.5) / 10.0

                SendNUIMessage({
                    type   = "update",
                    inBoat = true,
                    depth  = depthRounded,
                    speed  = speedRounded
                })
            else
                SendNUIMessage({
                    type   = "update",
                    inBoat = false
                })
            end

            Wait(400)
        else
            Wait(1000)
        end
    end
end)
