-- Migration to create an optimized view for announcements that resolves names via DB joins instead of Node.js mapping in memory

CREATE OR REPLACE VIEW vw_announcements_resolved AS
SELECT 
    a.id,
    a.organization_id,
    a.branch_id,
    a.title,
    a.body,
    a.kind,
    a.is_featured,
    a.publish_at,
    a.expires_at,
    a.target_scope,
    a.created_by,
    COALESCE(e.first_name || ' ' || e.last_name, u.raw_user_meta_data->>'full_name', 'Dirección General') as author_name,
    (
        SELECT jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name))
        FROM jsonb_array_elements_text(a.target_scope->'locations') as loc_id
        JOIN branches b ON b.id::text = loc_id
    ) as resolved_locations,
    (
        SELECT jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name))
        FROM jsonb_array_elements_text(a.target_scope->'department_ids') as dep_id
        JOIN organization_departments d ON d.id::text = dep_id
    ) as resolved_departments,
    (
        SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name))
        FROM jsonb_array_elements_text(a.target_scope->'position_ids') as pos_id
        JOIN department_positions p ON p.id::text = pos_id
    ) as resolved_positions,
    (
        SELECT jsonb_agg(jsonb_build_object('id', eu.user_id, 'name', eu.first_name || ' ' || eu.last_name))
        FROM jsonb_array_elements_text(a.target_scope->'users') as uid
        JOIN employees eu ON eu.user_id::text = uid
    ) as resolved_users
FROM announcements a
LEFT JOIN employees e ON e.user_id = a.created_by
LEFT JOIN auth.users u ON u.id = a.created_by;

-- Note: In a true SaaS with strict RLS, views should be either created with right owner or standard RLS applies 
-- implicitly if queried by authenticated user (views use invoker rights by default or we can set it).
