
local ids = {};
local newIds = {};
local primaryKeyIndex = {};
local count = 0;

ids = redis.call('ZREVRANGE', ARGV[1], tonumber(ARGV[2]), tonumber(ARGV[3]));

for i,v in ipairs(ids) do
    newIds[i] = ARGV[4] .. ':' .. v;
    primaryKeyIndex[i] = 'z:' .. ARGV[4] .. ':id:' .. v;
    count = count + 1;
end;

if count == 0 then
    return {nil, nil};
end

local retval = {ids, redis.call('MGET', unpack(newIds))};

redis.call('DEL', unpack(newIds));
redis.call('ZREM', ARGV[1], unpack(ids));
redis.call('DEL', unpack(primaryKeyIndex));

if ARGV[5] then
    redis.call('ZREM', ARGV[5], unpack(ids));
end

return retval;

