local ids = redis.call("ZRANGE", KEYS[1], KEYS[2], KEYS[3]); 
local newIds = {}; 

for i,v in ipairs(ids) do 
    newIds[i] = KEYS[4] .. v; 
end; 

return redis.call("MGET", unpack(newIds));
