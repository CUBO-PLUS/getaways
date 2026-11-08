FROM postgres:18.6-alpine AS build

RUN apk add --no-cache build-base clang21 llvm21
ADD --checksum=sha256:cac0b10c360f05b2d521200105ba3697e773d4cd3731f5a915a7e37ebe0bea85 https://github.com/pgvector/pgvector/archive/refs/tags/v0.8.7.tar.gz /tmp/pgvector.tar.gz
RUN tar -xzf /tmp/pgvector.tar.gz -C /tmp \
    && make -C /tmp/pgvector-0.8.7 OPTFLAGS="" \
    && make -C /tmp/pgvector-0.8.7 install

FROM postgres:18.6-alpine
COPY --from=build /usr/local/lib/postgresql/vector.so /usr/local/lib/postgresql/vector.so
COPY --from=build /usr/local/lib/postgresql/bitcode/vector /usr/local/lib/postgresql/bitcode/vector
COPY --from=build /usr/local/lib/postgresql/bitcode/vector.index.bc /usr/local/lib/postgresql/bitcode/vector.index.bc
COPY --from=build /usr/local/share/postgresql/extension/vector* /usr/local/share/postgresql/extension/
COPY infrastructure/postgres/vector.sql /docker-entrypoint-initdb.d/vector.sql
