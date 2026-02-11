FROM golang:1.24-alpine AS builder
WORKDIR /app
COPY go.mod ./
RUN go mod download
COPY . .
RUN go build -o goshare ./cmd/goshare

FROM alpine:latest
WORKDIR /app
COPY --from=builder /app/goshare .
COPY --from=builder /app/web ./web
EXPOSE 8080
CMD ["./goshare"]
