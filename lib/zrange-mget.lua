local ids = redis.call("ZRANGE", KEYS[1], KEYS[2], KEYS[3]); 
local newIds = {}; 
local count = 0;

for i,v in ipairs(ids) do 
    newIds[i] = KEYS[4] .. v; 
    count = count + 1;
end; 

if count == 0 then 
    return '';
end
return redis.call("MGET", unpack(newIds));
