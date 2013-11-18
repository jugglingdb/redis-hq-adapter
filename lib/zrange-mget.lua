local ids = {};
local newIds = {};
local count = 0;

if ARGV[5] and ARGV[6] then
    ids = redis.call('ZRANGEBYSCORE', ARGV[1], ARGV[5], ARGV[6], 'LIMIT', tonumber(ARGV[2]), tonumber(ARGV[3]));
else
    ids = redis.call('ZRANGE', ARGV[1], tonumber(ARGV[2]), tonumber(ARGV[3]));
end

for i,v in ipairs(ids) do
    newIds[i] = ARGV[4] .. ':' .. v;
    count = count + 1;
end;

if count == 0 then
    return {nil, nil};
end

return {ids, redis.call('MGET', unpack(newIds))};
