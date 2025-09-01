-- Drop tables if they exist (in dependency order)
DROP TABLE IF EXISTS captcha_log        CASCADE;
DROP TABLE IF EXISTS game_action_status CASCADE;
DROP TABLE IF EXISTS session            CASCADE;
DROP TABLE IF EXISTS game_credential    CASCADE;
DROP TABLE IF EXISTS game               CASCADE;
DROP TABLE IF EXISTS team               CASCADE;
DROP TABLE IF EXISTS actions            CASCADE;

-- 1) team
CREATE TABLE team (
  id          SERIAL       PRIMARY KEY,
  code        TEXT         NOT NULL UNIQUE,
  name        TEXT         NOT NULL,
  created_at  TIMESTAMPTZ  DEFAULT now()
);

-- 2) game
CREATE TABLE game (
  id            SERIAL       PRIMARY KEY,
  name          TEXT         NOT NULL,      -- e.g. 'BattleQuest'
  login_url     TEXT         NOT NULL,      -- e.g. 'https://…'
  dashboard_url TEXT,                       -- e.g. 'https://…' (optional, defaults to login_url)
  created_at    TIMESTAMPTZ  DEFAULT now()
);

-- 3) game_credential
-- each row now ties a team to a game plus its creds
CREATE TABLE game_credential (
  id          SERIAL       PRIMARY KEY,
  team_id     INTEGER      NOT NULL
               REFERENCES team(id)
               ON DELETE CASCADE,
  game_id     INTEGER      NOT NULL
               REFERENCES game(id)
               ON DELETE CASCADE,
  user_id     UUID         NOT NULL
               REFERENCES auth.users(id),
  username    TEXT         NOT NULL,
  password    TEXT         NOT NULL,
  created_at  TIMESTAMPTZ  DEFAULT now()
);

-- 4) session
-- unchanged except point at the credential
CREATE TABLE session (
  id                   SERIAL       PRIMARY KEY,
  user_id              UUID         NOT NULL
                         REFERENCES auth.users(id),
  game_credential_id   INTEGER      NOT NULL
                         REFERENCES game_credential(id)
                         ON DELETE CASCADE,
  session_token        TEXT         NOT NULL,
  session_data         JSONB        DEFAULT '{}'::JSONB,
  expires_at           TIMESTAMPTZ,
  is_active            BOOLEAN      DEFAULT TRUE,
  created_at           TIMESTAMPTZ  DEFAULT now()
);

CREATE TABLE game_action_status (
  id                  SERIAL PRIMARY KEY,
  team_id             INTEGER NOT NULL REFERENCES team(id) ON DELETE CASCADE,
  game_id             INTEGER NOT NULL REFERENCES game(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES auth.users(id),
  action              TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'unknown' CHECK (status IN ('success', 'fail', 'unknown')),
  inputs              JSONB,
  execution_time_secs NUMERIC(10,2),
  message             TEXT,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create the actions table
CREATE TABLE actions (
  id            SERIAL       PRIMARY KEY,
  game_id       INTEGER NOT NULL REFERENCES game(id) ON DELETE CASCADE,
  name          TEXT         NOT NULL,                    -- "new_account", "ban_user"
  display_name  TEXT,
  inputs_json   JSONB,                                    -- Field definitions (can be null)
  script_code   TEXT,                                     -- JavaScript code for the action
  updated_at    TIMESTAMPTZ  DEFAULT now()
);

CREATE INDEX ON session(user_id);
CREATE INDEX ON session(game_credential_id);
CREATE INDEX ON session(is_active);

CREATE INDEX ON game_action_status(team_id, game_id);
CREATE INDEX ON game_action_status(updated_at);

-- 4) captcha_log
CREATE TABLE captcha_log (
  id           SERIAL       PRIMARY KEY,     -- auto-incrementing ID
  image_path   TEXT         NOT NULL,        -- storage key or URL of CAPTCHA image
  api_response TEXT,                         -- what Gemini returned (nullable)
  api_status   TEXT         NOT NULL DEFAULT 'fail'
                                        CHECK (api_status IN ('success','fail')),
  solved_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

DROP FUNCTION IF EXISTS get_latest_game_action_status(integer);
-- Function to get latest game action status for each team_id, game_id, action combination
CREATE OR REPLACE FUNCTION get_latest_game_action_status(team_id_param INTEGER)
RETURNS TABLE (
  id INTEGER,
  team_id INTEGER,
  game_id INTEGER,
  action TEXT,
  status TEXT,
  message TEXT,
  inputs JSONB,
  execution_time_secs NUMERIC(10,2),
  updated_at TIMESTAMPTZ,
  game_name TEXT,
  game_login_url TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH latest_records AS (
    SELECT 
      gas.id,
      gas.team_id,
      gas.game_id,
      gas.action,
      gas.status,
      gas.message,
      gas.inputs,
      gas.execution_time_secs,
      gas.updated_at,
      ROW_NUMBER() OVER (
        PARTITION BY gas.team_id, gas.game_id, gas.action 
        ORDER BY gas.updated_at DESC
      ) as rn
    FROM game_action_status gas
    WHERE gas.team_id = team_id_param
  )
  SELECT 
    lr.id,
    lr.team_id,
    lr.game_id,
    lr.action,
    lr.status,
    lr.message,
    lr.inputs,
    lr.execution_time_secs,
    lr.updated_at,
    g.name as game_name,
    g.login_url as game_login_url
  FROM latest_records lr
  JOIN game g ON lr.game_id = g.id
  WHERE lr.rn = 1
  ORDER BY lr.updated_at DESC;
END;
$$ LANGUAGE plpgsql;


INSERT INTO public.team (code, name) VALUES
  ('ent1', 'Big Money Gaming Support'),
  ('ent2', 'Highstakes Gaming Support'),
  ('ent3', 'Power house'),
  ('ent4', 'Crown Gaming'),
  ('ent8', 'Overdrive Gaming');

INSERT INTO public.game (name, login_url) VALUES
  ('Yolo', 'https://agent.yolo777.game/'),
  ('Orion Stars', 'https://orionstars.vip:8781/default.aspx'),
  ('Game Vault', 'https://agent.gamevault999.com/login'),
  ('Orion Strike', 'https://www.orionstrike777.com/admin/login'),
  ('Mr All In One', 'https://agentserver.mrallinone777.com/'),
  ('Juwa City', 'https://ht.juwa777.com/login');


-- Insert actions for all games
INSERT INTO actions (game_id, name, inputs_json) 
SELECT 
  g.id as game_id,
  'new_account' as name,
  '{"fields": [{"key": "account_name", "label": "Account Name"}, {"key": "new_password", "label": "New Password"}]}'::jsonb as inputs_json
FROM game g
WHERE NOT EXISTS (
  SELECT 1 FROM actions a WHERE a.game_id = g.id AND a.name = 'new_account'
);

INSERT INTO actions (game_id, name, inputs_json) 
SELECT 
  g.id as game_id,
  'password_reset' as name,
  '{"fields": [{"key": "account_name", "label": "Account Name"}, {"key": "new_password", "label": "New Password"}]}'::jsonb as inputs_json
FROM game g
WHERE NOT EXISTS (
  SELECT 1 FROM actions a WHERE a.game_id = g.id AND a.name = 'password_reset'
);

INSERT INTO actions (game_id, name, inputs_json) 
SELECT 
  g.id as game_id,
  'recharge' as name,
  '{"fields": [{"key": "account_name", "label": "Account Name"}, {"key": "amount", "label": "Amount"}, {"key": "remark", "label": "Remark"}]}'::jsonb as inputs_json
FROM game g
WHERE NOT EXISTS (
  SELECT 1 FROM actions a WHERE a.game_id = g.id AND a.name = 'recharge'
);

INSERT INTO actions (game_id, name, inputs_json) 
SELECT 
  g.id as game_id,
  'redeem' as name,
  '{"fields": [{"key": "account_name", "label": "Account Name"}, {"key": "amount", "label": "Amount"}, {"key": "remark", "label": "Remark"}]}'::jsonb as inputs_json
FROM game g
WHERE NOT EXISTS (
  SELECT 1 FROM actions a WHERE a.game_id = g.id AND a.name = 'redeem'
);
