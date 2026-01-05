import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Download, Search, ShieldCheck } from 'lucide-react';
import { computeTotals, listLocalOrders, updateLocalOrderStatus, type LocalOrder, type OrderStatus } from '../orders/localOrders';
import { listStaffOrders, updateOrderStatusAsStaff, type DbOrderStatus, type StaffOrderRow } from '../orders/supabaseOrders';
import { supabase } from '../lib/supabaseClient';

interface AdminPanelProps {
  onBack: () => void;
  embedded?: boolean;
  role?: 'admin' | 'employee';
}

const STATUSES: OrderStatus[] = ['Scheduled', 'Picked Up', 'In Transit', 'Delayed', 'Out for Delivery', 'Delivered'];

const escapeCsv = (value: unknown) => {
  const s = String(value ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

type WorkOrderFields = {
  pickup_name: string;
  pickup_phone: string;
  pickup_address: string;
  dropoff_name: string;
  dropoff_phone: string;
  dropoff_address: string;
  vehicle: string;
  vin: string;
  transaction_id: string;
  release_form_number: string;
  arrival_date: string;
};

const readObj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' ? (v as Record<string, unknown>) : null);
const readStr = (v: unknown) => (typeof v === 'string' ? v : String(v ?? '')).trim();

const getWorkOrderFields = (order: LocalOrder): WorkOrderFields => {
  const form = readObj(order.form_data);
  const vehicle = readObj(form?.vehicle);
  const pickup = readObj(form?.pickup_location);
  const dropoff = readObj(form?.dropoff_location);
  const txn = readObj(form?.transaction);

  const year = readStr(vehicle?.year);
  const make = readStr(vehicle?.make);
  const model = readStr(vehicle?.model);
  const vehicleLabel = [year, make, model].filter(Boolean).join(' ').trim();

  return {
    pickup_name: readStr(pickup?.name),
    pickup_phone: readStr(pickup?.phone),
    pickup_address: readStr(pickup?.address),
    dropoff_name: readStr(dropoff?.name),
    dropoff_phone: readStr(dropoff?.phone),
    dropoff_address: readStr(dropoff?.address),
    vehicle: vehicleLabel,
    vin: readStr(vehicle?.vin),
    transaction_id: readStr(txn?.transaction_id ?? (form as Record<string, unknown>)?.transaction_id),
    release_form_number: readStr(txn?.release_form_number ?? (form as Record<string, unknown>)?.release_form_number),
    arrival_date: readStr(txn?.arrival_date ?? (form as Record<string, unknown>)?.arrival_date),
  };
};

export default function AdminPanel({ onBack, embedded = false, role = 'admin' }: AdminPanelProps) {
  const isLocalDev = import.meta.env.DEV && window.location.hostname === 'localhost';
  const isEmployee = role === 'employee';

  type AdminOrder = LocalOrder & { db_id?: string };
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');

  const [nextStatus, setNextStatus] = useState<OrderStatus>('Scheduled');
  const [note, setNote] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const reload = useCallback(() => {
    if (isLocalDev) {
      try {
        setOrders(listLocalOrders());
      } catch {
        setOrders([]);
      }
      return;
    }

    if (!supabase) {
      setOrders([]);
      return;
    }

    listStaffOrders()
      .then((rows) => {
        const mapped: AdminOrder[] = (rows as StaffOrderRow[]).map((r) => {
          const routeArea = String(r.route_area ?? '').trim();
          const subtotal = Number(r.price_before_tax ?? 0);
          const totals = computeTotals(subtotal, routeArea);
          const docsRaw = r.documents as unknown;
          const docs = Array.isArray(docsRaw)
            ? (docsRaw as unknown[])
                .map((d) => (d && typeof d === 'object' ? (d as Record<string, unknown>) : null))
                .filter(Boolean)
                .map((d) => ({
                  id: String(d?.id ?? ''),
                  name: String(d?.name ?? ''),
                  mime: String(d?.mime ?? ''),
                  size: Number(d?.size ?? 0),
                  kind: (String(d?.kind ?? 'unknown') as 'required' | 'optional' | 'unknown') || 'unknown',
                }))
            : [];

          return {
            db_id: r.id,
            id: r.order_code,
            created_at: r.created_at,
            updated_at: r.updated_at,
            service_type: (r.service_type === 'delivery_one_way' ? 'delivery_one_way' : 'pickup_one_way') as LocalOrder['service_type'],
            vehicle_type: 'standard',
            route_area: routeArea,
            fulfillment_days_min: 0,
            fulfillment_days_max: 0,
            totals,
            documents: docs,
            form_data: r.form_data,
            status: r.status as OrderStatus,
            status_events: [],
            payment_status: r.payment_status,
          };
        });
        setOrders(mapped);
      })
      .catch(() => {
        setOrders([]);
      });
  }, [isLocalDev]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!selectedId) return;
    const selected = orders.find((o) => o.id === selectedId);
    if (!selected) return;
    setNextStatus(selected.status);
  }, [orders, selectedId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders
      .filter((o) => (statusFilter === 'all' ? true : o.status === statusFilter))
      .filter((o) => {
        if (!q) return true;
        const wo = getWorkOrderFields(o);
        const hay = [
          o.id,
          o.route_area,
          wo.pickup_address,
          wo.dropoff_address,
          wo.vehicle,
          wo.vin,
          wo.transaction_id,
          wo.release_form_number,
          wo.pickup_name,
          wo.pickup_phone,
          wo.dropoff_name,
          wo.dropoff_phone,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
  }, [orders, search, statusFilter]);

  const selectedOrder = useMemo(() => {
    const id = String(selectedId ?? '').trim();
    if (!id) return null;
    return orders.find((o) => o.id === id) ?? null;
  }, [orders, selectedId]);

  const exportCsv = () => {
    const rows = filtered;
    const header = [
      'order_id',
      'status',
      'payment_status',
      'route_area',
      'service_type',
      'pickup_address',
      'dropoff_address',
      'vehicle',
      'vin',
      'transaction_id',
      'release_form_number',
      'arrival_date',
      'subtotal',
      'tax',
      'total',
      'tax_note',
      'created_at',
      'updated_at',
    ];

    const lines = [header.join(',')];
    for (const o of rows) {
      const wo = getWorkOrderFields(o);
      const data = [
        o.id,
        o.status,
        o.payment_status ?? 'unpaid',
        o.route_area,
        o.service_type,
        wo.pickup_address,
        wo.dropoff_address,
        wo.vehicle,
        wo.vin,
        wo.transaction_id,
        wo.release_form_number,
        wo.arrival_date,
        o.totals?.subtotal ?? 0,
        o.totals?.tax ?? 0,
        o.totals?.total ?? 0,
        o.totals?.tax_note ?? '',
        o.created_at,
        o.updated_at,
      ];
      lines.push(data.map(escapeCsv).join(','));
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `easydrive-orders-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const applyStatusUpdate = () => {
    setActionError(null);
    if (!selectedOrder) return;
    const trimmed = note.trim();

    if (isLocalDev) {
      const next = updateLocalOrderStatus(selectedOrder.id, nextStatus, trimmed || undefined);
      if (!next) {
        setActionError('Failed to update order.');
        return;
      }
      setNote('');
      reload();
      return;
    }

    const dbId = String((selectedOrder as AdminOrder).db_id ?? '').trim();
    if (!dbId) {
      setActionError('Failed to update order.');
      return;
    }

    void updateOrderStatusAsStaff(dbId, nextStatus as DbOrderStatus, trimmed || null)
      .then(() => {
        setNote('');
        reload();
      })
      .catch((e) => {
        setActionError(e instanceof Error ? e.message : 'Failed to update order.');
      });
  };

  return (
    <div className={embedded ? 'bg-gray-50' : 'min-h-screen bg-gray-50'}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        {!embedded ? (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gray-900 text-white">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <div className="text-lg sm:text-xl font-bold text-gray-900">Admin</div>
                <div className="text-xs sm:text-sm text-gray-600">Work orders</div>
              </div>
            </div>
          </div>
        ) : null}

        <div className={embedded ? 'grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6' : 'mt-5 grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6'}>
          <div className="lg:col-span-1">
            <div className="rounded-2xl bg-white border border-gray-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-gray-100">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-gray-900">Work orders</div>
                  {!isEmployee ? (
                    <button
                      type="button"
                      onClick={exportCsv}
                      className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-3 py-2 text-xs font-semibold text-white hover:bg-gray-800 transition-colors"
                    >
                      <Download className="h-4 w-4" />
                      Export CSV
                    </button>
                  ) : null}
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2">
                  <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2">
                    <Search className="h-4 w-4 text-gray-500" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search by ID, pickup, dropoff, vehicle, VIN..."
                      className="w-full text-sm outline-none"
                    />
                  </div>

                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as OrderStatus | 'all')}
                    className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="all">All statuses</option>
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mt-3 text-xs text-gray-500">Showing {filtered.length} orders</div>
              </div>

              <div className="p-3">
                {filtered.length === 0 ? (
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">No orders.</div>
                ) : (
                  <div className="space-y-2 max-h-[calc(100vh-18rem)] overflow-auto">
                    {filtered.map((o) => {
                      const active = o.id === selectedId;
                      const wo = getWorkOrderFields(o);
                      const pickupLabel = wo.pickup_address || wo.pickup_name;
                      const dropoffLabel = wo.dropoff_address || wo.dropoff_name;
                      return (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => setSelectedId(o.id)}
                          className={`w-full text-left rounded-xl border px-3 py-3 transition-colors ${
                            active ? 'border-cyan-300 bg-cyan-50' : 'border-gray-200 bg-white hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-sm font-semibold text-gray-900 truncate">{o.id}</div>
                            <div className="text-[11px] font-semibold text-gray-600">{o.status}</div>
                          </div>
                          <div className="mt-1 text-xs text-gray-600 truncate">{pickupLabel && dropoffLabel ? `${pickupLabel} → ${dropoffLabel}` : o.route_area}</div>
                          <div className="mt-1 flex items-center justify-between gap-2 text-xs text-gray-600">
                            <div className="truncate">{wo.vehicle || o.route_area}</div>
                            <div>{new Date(o.updated_at).toLocaleString()}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="rounded-2xl bg-white border border-gray-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-gray-100">
                <div className="text-sm font-semibold text-gray-900">Work order details</div>
                <div className="text-xs text-gray-600">Pickup / dropoff + update status + timeline notes</div>
              </div>

              {!selectedOrder ? (
                <div className="p-4">
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">Select an order to manage.</div>
                </div>
              ) : (
                <div className="p-4 space-y-4">
                  {(() => {
                    const wo = getWorkOrderFields(selectedOrder);
                    return (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                          <div className="text-xs text-gray-500">Pickup</div>
                          <div className="mt-1 text-sm font-semibold text-gray-900">{wo.pickup_address || '-'}</div>
                          <div className="mt-1 text-xs text-gray-600">{[wo.pickup_name, wo.pickup_phone].filter(Boolean).join(' • ') || ' '}</div>
                        </div>
                        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                          <div className="text-xs text-gray-500">Drop-off</div>
                          <div className="mt-1 text-sm font-semibold text-gray-900">{wo.dropoff_address || '-'}</div>
                          <div className="mt-1 text-xs text-gray-600">{[wo.dropoff_name, wo.dropoff_phone].filter(Boolean).join(' • ') || ' '}</div>
                        </div>
                        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                          <div className="text-xs text-gray-500">Vehicle</div>
                          <div className="mt-1 text-sm font-semibold text-gray-900">{wo.vehicle || '-'}</div>
                          <div className="mt-1 text-xs text-gray-600">VIN: {wo.vin || '-'}</div>
                        </div>
                        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                          <div className="text-xs text-gray-500">Identifiers</div>
                          <div className="mt-1 text-xs text-gray-700">Transaction ID: {wo.transaction_id || '-'}</div>
                          <div className="mt-1 text-xs text-gray-700">Release Form #: {wo.release_form_number || '-'}</div>
                          <div className="mt-1 text-xs text-gray-700">Arrival Date: {wo.arrival_date || '-'}</div>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
                    <div className="p-4 border-b border-gray-100">
                      <div className="text-sm font-semibold text-gray-900">Documents</div>
                      <div className="text-xs text-gray-600">Required docs help drivers confirm release/work order exists.</div>
                    </div>
                    <div className="p-4">
                      {selectedOrder.documents?.length ? (
                        <div className="space-y-2">
                          {selectedOrder.documents.map((d) => (
                            <div key={d.id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-gray-900 truncate">{d.name}</div>
                                <div className="text-xs text-gray-600 truncate">{d.mime}</div>
                              </div>
                              <div className="text-xs font-semibold text-gray-700">{d.kind}</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-gray-600">No documents recorded.</div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
                    <div className="p-4 border-b border-gray-100">
                      <div className="text-sm font-semibold text-gray-900">Update status</div>
                      <div className="text-xs text-gray-600">Adds a timeline event with timestamp.</div>
                    </div>
                    <div className="p-4 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <select
                          value={nextStatus}
                          onChange={(e) => setNextStatus(e.target.value as OrderStatus)}
                          className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm"
                        >
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={applyStatusUpdate}
                          className="rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 transition-colors"
                        >
                          Apply
                        </button>
                      </div>

                      <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        className="w-full min-h-[90px] rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm"
                        placeholder="Optional note (shows in customer tracking timeline)"
                      />

                      {actionError ? <div className="text-sm text-red-700">{actionError}</div> : null}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
                    <div className="p-4 border-b border-gray-100">
                      <div className="text-sm font-semibold text-gray-900">Timeline</div>
                      <div className="text-xs text-gray-600">Most recent first</div>
                    </div>
                    <div className="p-4 space-y-2">
                      {(selectedOrder.status_events ?? []).length === 0 ? (
                        <div className="text-sm text-gray-600">No events yet.</div>
                      ) : (
                        (selectedOrder.status_events ?? []).map((ev, idx) => (
                          <div key={`${ev.at}-${idx}`} className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-sm font-semibold text-gray-900">{ev.status}</div>
                              <div className="text-xs text-gray-600">{new Date(ev.at).toLocaleString()}</div>
                            </div>
                            {ev.note ? <div className="mt-1 text-sm text-gray-700">{ev.note}</div> : null}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
