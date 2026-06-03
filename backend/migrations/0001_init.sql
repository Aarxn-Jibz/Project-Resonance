CREATE TABLE songs (
  job_id            TEXT    PRIMARY KEY,
  filename          TEXT    NOT NULL,
  input_hash        TEXT    NOT NULL UNIQUE,
  timestamp         INTEGER NOT NULL,
  stem_vocals       TEXT,
  stem_drums        TEXT,
  stem_bass         TEXT,
  stem_guitar       TEXT,
  stem_piano        TEXT,
  stem_other        TEXT,
  midi_vocals       TEXT,
  midi_bass         TEXT,
  midi_piano        TEXT,
  has_midi_vocals   INTEGER NOT NULL DEFAULT 0,
  has_midi_bass     INTEGER NOT NULL DEFAULT 0,
  has_midi_piano    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_songs_hash      ON songs (input_hash);
CREATE INDEX idx_songs_timestamp ON songs (timestamp DESC);
