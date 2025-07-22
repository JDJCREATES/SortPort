-- Phase 4: Production Monitoring Database Schema
-- This migration creates the necessary tables for comprehensive monitoring,
-- metrics collection, cost analytics, and performance tracking.

-- Create metrics_events table for aggregated event storage
CREATE TABLE IF NOT EXISTS public.metrics_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    event_type TEXT NOT NULL,
    operation TEXT NOT NULL,
    minute_timestamp TIMESTAMPTZ NOT NULL,
    count INTEGER NOT NULL DEFAULT 1,
    success_count INTEGER NOT NULL DEFAULT 0,
    total_duration BIGINT NOT NULL DEFAULT 0,
    unique_users_count INTEGER NOT NULL DEFAULT 0,
    avg_duration DOUBLE PRECISION NOT NULL DEFAULT 0,
    success_rate DOUBLE PRECISION NOT NULL DEFAULT 0,
    metadata JSONB,
    user_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_metrics_events_type_timestamp ON public.metrics_events(event_type, minute_timestamp);
CREATE INDEX IF NOT EXISTS idx_metrics_events_user_timestamp ON public.metrics_events(user_id, minute_timestamp);
CREATE INDEX IF NOT EXISTS idx_metrics_events_operation ON public.metrics_events(operation);

-- Create cost_tracking table for detailed cost analytics
CREATE TABLE IF NOT EXISTS public.cost_tracking (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    service_type TEXT NOT NULL, -- 'vision', 'embeddings', 'storage'
    operation_type TEXT NOT NULL, -- 'atlas_analysis', 'individual_analysis', etc.
    tokens_used INTEGER NOT NULL DEFAULT 0,
    estimated_cost DECIMAL(10,6) NOT NULL DEFAULT 0,
    actual_cost DECIMAL(10,6),
    savings_amount DECIMAL(10,6) NOT NULL DEFAULT 0,
    optimization_used BOOLEAN NOT NULL DEFAULT false,
    request_metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Create indexes for cost tracking
CREATE INDEX IF NOT EXISTS idx_cost_tracking_user_date ON public.cost_tracking(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_cost_tracking_service ON public.cost_tracking(service_type, created_at);

-- Create performance_snapshots table for historical performance data
CREATE TABLE IF NOT EXISTS public.performance_snapshots (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    snapshot_timestamp TIMESTAMPTZ NOT NULL,
    avg_response_time DOUBLE PRECISION NOT NULL,
    requests_per_minute DOUBLE PRECISION NOT NULL,
    error_rate DOUBLE PRECISION NOT NULL,
    cache_hit_rate DOUBLE PRECISION NOT NULL,
    active_users INTEGER NOT NULL,
    system_health TEXT NOT NULL CHECK (system_health IN ('healthy', 'degraded', 'critical')),
    total_costs JSONB,
    detailed_metrics JSONB,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Create index for performance snapshots
CREATE INDEX IF NOT EXISTS idx_performance_snapshots_timestamp ON public.performance_snapshots(snapshot_timestamp);

-- Create atlas_statistics table for atlas optimization tracking
CREATE TABLE IF NOT EXISTS public.atlas_statistics (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    atlas_id TEXT NOT NULL UNIQUE,
    user_id UUID REFERENCES auth.users(id),
    image_count INTEGER NOT NULL,
    generation_time_ms INTEGER NOT NULL,
    file_size_bytes INTEGER NOT NULL,
    compression_ratio DOUBLE PRECISION NOT NULL,
    cache_hit BOOLEAN NOT NULL DEFAULT false,
    vision_tokens_used INTEGER NOT NULL DEFAULT 0,
    estimated_cost_savings DECIMAL(10,6) NOT NULL DEFAULT 0,
    analysis_results JSONB,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Create indexes for atlas statistics
CREATE INDEX IF NOT EXISTS idx_atlas_statistics_user ON public.atlas_statistics(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_atlas_statistics_atlas_id ON public.atlas_statistics(atlas_id);

-- Create user_usage_patterns table for pattern analysis
CREATE TABLE IF NOT EXISTS public.user_usage_patterns (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    analysis_period TEXT NOT NULL, -- 'hour', 'day', 'week', 'month'
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    total_requests INTEGER NOT NULL DEFAULT 0,
    total_images_processed INTEGER NOT NULL DEFAULT 0,
    atlas_usage_rate DOUBLE PRECISION NOT NULL DEFAULT 0,
    avg_cost_per_image DECIMAL(10,6) NOT NULL DEFAULT 0,
    preferred_operations JSONB,
    peak_usage_hours INTEGER[],
    optimization_score DOUBLE PRECISION NOT NULL DEFAULT 0,
    cost_breakdown JSONB,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Create indexes for usage patterns
CREATE INDEX IF NOT EXISTS idx_user_usage_patterns_user_period ON public.user_usage_patterns(user_id, analysis_period, period_start);

-- Create alerts_config table for monitoring alerts
CREATE TABLE IF NOT EXISTS public.alerts_config (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    alert_type TEXT NOT NULL,
    threshold_value DOUBLE PRECISION NOT NULL,
    comparison_operator TEXT NOT NULL CHECK (comparison_operator IN ('>', '<', '>=', '<=', '=')),
    severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
    enabled BOOLEAN NOT NULL DEFAULT true,
    notification_channels JSONB,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Insert default alert configurations
INSERT INTO public.alerts_config (alert_type, threshold_value, comparison_operator, severity, notification_channels) VALUES
('error_rate', 5.0, '>', 'warning', '{"email": true, "slack": false}'),
('error_rate', 10.0, '>', 'critical', '{"email": true, "slack": true}'),
('response_time', 5000.0, '>', 'warning', '{"email": true}'),
('response_time', 10000.0, '>', 'critical', '{"email": true, "slack": true}'),
('daily_cost', 500.0, '>', 'warning', '{"email": true}'),
('daily_cost', 1000.0, '>', 'critical', '{"email": true, "slack": true}')
ON CONFLICT DO NOTHING;

-- Create active_alerts table for tracking fired alerts
CREATE TABLE IF NOT EXISTS public.active_alerts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    alert_config_id UUID REFERENCES public.alerts_config(id),
    alert_type TEXT NOT NULL,
    severity TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    current_value DOUBLE PRECISION NOT NULL,
    threshold_value DOUBLE PRECISION NOT NULL,
    first_triggered_at TIMESTAMPTZ NOT NULL,
    last_triggered_at TIMESTAMPTZ NOT NULL,
    acknowledged BOOLEAN NOT NULL DEFAULT false,
    acknowledged_by UUID REFERENCES auth.users(id),
    acknowledged_at TIMESTAMPTZ,
    resolved BOOLEAN NOT NULL DEFAULT false,
    resolved_at TIMESTAMPTZ
);

-- Create indexes for active alerts
CREATE INDEX IF NOT EXISTS idx_active_alerts_type_severity ON public.active_alerts(alert_type, severity);
CREATE INDEX IF NOT EXISTS idx_active_alerts_unresolved ON public.active_alerts(resolved, last_triggered_at);

-- Create optimization_recommendations table
CREATE TABLE IF NOT EXISTS public.optimization_recommendations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    recommendation_type TEXT NOT NULL,
    priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high')),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    potential_savings DECIMAL(10,6) NOT NULL DEFAULT 0,
    implementation_effort TEXT NOT NULL CHECK (implementation_effort IN ('low', 'medium', 'high')),
    action_required TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'implemented', 'dismissed')),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    implemented_at TIMESTAMPTZ,
    estimated_impact JSONB
);

-- Create index for optimization recommendations
CREATE INDEX IF NOT EXISTS idx_optimization_recommendations_user_status ON public.optimization_recommendations(user_id, status, created_at);

-- Create RLS (Row Level Security) policies for data access control
ALTER TABLE public.metrics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_statistics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_usage_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.active_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.optimization_recommendations ENABLE ROW LEVEL SECURITY;

-- Allow service role to read/write all monitoring data
CREATE POLICY "Service role full access on metrics_events" ON public.metrics_events
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on cost_tracking" ON public.cost_tracking
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on performance_snapshots" ON public.performance_snapshots
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on atlas_statistics" ON public.atlas_statistics
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on user_usage_patterns" ON public.user_usage_patterns
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on active_alerts" ON public.active_alerts
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on optimization_recommendations" ON public.optimization_recommendations
    FOR ALL USING (auth.role() = 'service_role');

-- Allow authenticated users to read their own data
CREATE POLICY "Users can read own cost_tracking" ON public.cost_tracking
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can read own atlas_statistics" ON public.atlas_statistics
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can read own usage_patterns" ON public.user_usage_patterns
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can read own recommendations" ON public.optimization_recommendations
    FOR SELECT USING (auth.uid() = user_id);

-- Create functions for automated data aggregation and cleanup

-- Function to aggregate hourly metrics
CREATE OR REPLACE FUNCTION aggregate_hourly_metrics() RETURNS void AS $$
BEGIN
    -- Aggregate metrics older than 24 hours into hourly buckets
    INSERT INTO public.metrics_events (
        event_type, operation, minute_timestamp, count, success_count, 
        total_duration, unique_users_count, avg_duration, success_rate, metadata
    )
    SELECT 
        event_type,
        operation,
        date_trunc('hour', minute_timestamp) as hour_timestamp,
        SUM(count) as total_count,
        SUM(success_count) as total_success,
        SUM(total_duration) as total_duration,
        SUM(unique_users_count) as total_users,
        AVG(avg_duration) as avg_duration,
        AVG(success_rate) as avg_success_rate,
        jsonb_object_agg('aggregated', true) as metadata
    FROM public.metrics_events 
    WHERE minute_timestamp < now() - interval '24 hours'
        AND date_trunc('hour', minute_timestamp) NOT IN (
            SELECT DISTINCT date_trunc('hour', minute_timestamp) 
            FROM public.metrics_events 
            WHERE metadata->>'aggregated' = 'true'
        )
    GROUP BY event_type, operation, date_trunc('hour', minute_timestamp)
    HAVING COUNT(*) > 0;

    -- Delete the aggregated minute-level data
    DELETE FROM public.metrics_events 
    WHERE minute_timestamp < now() - interval '24 hours'
        AND (metadata->>'aggregated' IS NULL OR metadata->>'aggregated' != 'true');
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup old data
CREATE OR REPLACE FUNCTION cleanup_old_monitoring_data() RETURNS void AS $$
BEGIN
    -- Delete metrics older than 90 days
    DELETE FROM public.metrics_events WHERE created_at < now() - interval '90 days';
    
    -- Delete performance snapshots older than 30 days
    DELETE FROM public.performance_snapshots WHERE created_at < now() - interval '30 days';
    
    -- Delete resolved alerts older than 30 days
    DELETE FROM public.active_alerts WHERE resolved = true AND resolved_at < now() - interval '30 days';
    
    -- Archive old cost tracking data (keep for 1 year)
    -- This would typically move to a separate archival table
    DELETE FROM public.cost_tracking WHERE created_at < now() - interval '1 year';
END;
$$ LANGUAGE plpgsql;

-- Create scheduled jobs (would be set up with pg_cron extension)
-- These are commented out as they require pg_cron extension
-- SELECT cron.schedule('aggregate-metrics', '0 * * * *', 'SELECT aggregate_hourly_metrics();');
-- SELECT cron.schedule('cleanup-old-data', '0 2 * * *', 'SELECT cleanup_old_monitoring_data();');

-- Add comments to tables for documentation
COMMENT ON TABLE public.metrics_events IS 'Aggregated metrics events for performance monitoring and analytics';
COMMENT ON TABLE public.cost_tracking IS 'Detailed cost tracking for all services and operations';
COMMENT ON TABLE public.performance_snapshots IS 'Point-in-time performance snapshots for trend analysis';
COMMENT ON TABLE public.atlas_statistics IS 'Statistics and performance data for atlas generation and optimization';
COMMENT ON TABLE public.user_usage_patterns IS 'Analyzed user behavior patterns for optimization recommendations';
COMMENT ON TABLE public.alerts_config IS 'Configuration for monitoring alerts and thresholds';
COMMENT ON TABLE public.active_alerts IS 'Currently active or recently resolved monitoring alerts';
COMMENT ON TABLE public.optimization_recommendations IS 'AI-generated optimization recommendations for users';
