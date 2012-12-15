local members = redis.call('SMEMBERS', KEYS[2])
local results = {}
local count = 0
local limit = 0
local key = KEYS[1]

--check to see if we have a max results limit
if KEYS[4] then
    limit = tonumber(KEYS[4])
end

--comparison should be overridden by the calling code
local comparison = function(obj, val) 
    --SCRIPT--
end

local model = '--TYPE--'
model = model .. ':'

--loop through each element in the array
for i,v in ipairs(members) do
    --parse the json for each key
    local obj = cjson.decode(redis.call('GET', model .. v))

    --evaluate the comparison which compares vs KEYS[2]
    local result = comparison(obj, KEYS[3])

    if result then
        table.insert(results, v)

        --if we are limiting results, check to see if we have reached the limit
        if limit > 0 then
            count = count +1
            if count >= limit then
                break
            end
        end
    end
end

for i,v in ipairs(results) do
    --store the results
    redis.call('SADD', key, v)
end

--return the key of the final set
return key