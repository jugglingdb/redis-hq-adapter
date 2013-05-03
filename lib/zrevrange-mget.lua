local ids = redis.call('ZREVRANGE', ARGV[1], tonumber(ARGV[2]), tonumber(ARGV[3]));
local newIds = {}; 
local count = 0;

for i,v in ipairs(ids) do
    newIds[i] = ARGV[4] .. ':' .. v;
    count = count + 1;
end;

if count == 0 then
    return '';
end
return redis.call('MGET', unpack(newIds));
