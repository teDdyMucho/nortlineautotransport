import { createClient } from '@supabase/supabase-js';

export const handler = async (event) => {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl) return { statusCode: 500, body: 'Missing SUPABASE_URL' };
    if (!supabaseServiceRoleKey) return { statusCode: 500, body: 'Missing SUPABASE_SERVICE_ROLE_KEY' };

    const orderCode = String(event.queryStringParameters?.order_code ?? '').trim();
    if (!orderCode) return { statusCode: 400, body: 'Missing order_code' };

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: order, error } = await supabaseAdmin
      .from('orders')
      .select('id, order_code, status, created_at, updated_at')
      .eq('order_code', orderCode)
      .maybeSingle();

    if (error || !order) {
      return { statusCode: 404, body: 'Not found' };
    }

    const { data: events } = await supabaseAdmin
      .from('order_events')
      .select('status, note, at')
      .eq('order_id', order.id)
      .order('at', { ascending: false });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order: {
          id: order.id,
          order_code: order.order_code,
          status: order.status,
          created_at: order.created_at,
          updated_at: order.updated_at,
        },
        events: Array.isArray(events) ? events : [],
      }),
    };
  } catch {
    return { statusCode: 500, body: 'Error' };
  }
};
