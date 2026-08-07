-- Extensões necessárias para o roteamento.
-- postgis já é criado pelos scripts padrão da imagem; repetimos por segurança.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS hstore;
CREATE EXTENSION IF NOT EXISTS pgrouting;
