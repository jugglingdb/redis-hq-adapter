require(grDevices)
library(ggplot2)

readData = function (file) {
    read.table(file, header = F, sep = " ", col.names = c("tick", "duration", "heap", "total"))
}

png(
  '/tmp/graph.png'
)

ggplot() +
ggtitle("Benchmarking redis multi") + 
ylab("Duration of 1K calls (ms)") +
xlab("Batch number") +
theme(legend.title=element_blank()) +
geom_line(aes(tick, duration, colour="Pure commands (dur)"), readData("/tmp/data1")) +
geom_line(aes(tick, duration, colour="Multi (duration)"), readData("/tmp/data2"))

dev.off()

