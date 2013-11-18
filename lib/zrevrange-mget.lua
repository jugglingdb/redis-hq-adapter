local ids = {};
local newIds = {}; 
local count = 0;

if ARGV[5] and ARGV[6] then
    ids = redis.call('ZREVRANGEBYSCORE', ARGV[1], ARGV[6], ARGV[5], 'LIMIT', tonumber(ARGV[2]), tonumber(ARGV[3]));
else
    ids = redis.call('ZREVRANGE', ARGV[1], tonumber(ARGV[2]), tonumber(ARGV[3]));
end

for i,v in ipairs(ids) do
    newIds[i] = ARGV[4] .. ':' .. v;
    count = count + 1;
end;

if count == 0 then
    return {nil, nil};
end

return {ids, redis.call('MGET', unpack(newIds))};
