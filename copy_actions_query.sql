-- Query to copy all actions from game B to game A
SELECT copy_game_actions(12, 15); -- Copy from game 12 to game 15


CREATE OR REPLACE FUNCTION copy_game_actions(
    source_game_id INTEGER,
    destination_game_id INTEGER
)
RETURNS INTEGER AS $$
DECLARE
    copied_count INTEGER;
BEGIN
    INSERT INTO actions (game_id, name, display_name, inputs_json, script_code, updated_at)
    SELECT 
        destination_game_id as game_id,
        name,
        display_name,
        inputs_json,
        script_code,
        now() as updated_at
    FROM actions 
    WHERE game_id = source_game_id
    AND NOT EXISTS (
        -- Prevent duplicate actions if they already exist
        SELECT 1 FROM actions a2 
        WHERE a2.game_id = destination_game_id
        AND a2.name = actions.name
    );
    
    GET DIAGNOSTICS copied_count = ROW_COUNT;
    RETURN copied_count;
END;
$$ LANGUAGE plpgsql;

-- Query to check what actions will be copied (preview):
/*
SELECT 
    'Source Game' as source,
    g.name as game_name,
    a.name as action_name,
    a.display_name,
    a.inputs_json
FROM actions a
JOIN game g ON a.game_id = g.id
WHERE a.game_id = :game_b_id  -- Replace with source game ID

UNION ALL

SELECT 
    'Destination Game' as source,
    g.name as game_name,
    a.name as action_name,
    a.display_name,
    a.inputs_json
FROM actions a
JOIN game g ON a.game_id = g.id
WHERE a.game_id = :game_a_id  -- Replace with destination game ID
ORDER BY source, action_name;
*/
