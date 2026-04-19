-- Migration: Add prompt column to media for AI-generated assets
-- Created: 2026-04-18

ALTER TABLE media ADD COLUMN prompt TEXT;
