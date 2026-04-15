const express = require('express');
const { v4: uuid } = require('uuid');
const { db } = require('../database');
const { authMiddleware } = require('../middleware/auth');

// Migrate calendar_id onto the existing appointments table
try { db.exec(`ALTER TABLE appointments ADD COLUMN calendar_id TEXT`); } catch(e) {}

const router = express.Router();

/**
 * Helper: generate time slots between start and end at given interval
 * Returns array of "HH:MM" strings
 */
function generateTimeSlots(startTime, endTime, intervalMinutes) {
  const slots = [];
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);
  let current = startH * 60 + startM;
  const end = endH * 60 + endM;

  while (current < end) {
    const h = String(Math.floor(current / 60)).padStart(2, '0');
    const m = String(current % 60).padStart(2, '0');
    slots.push(`${h}:${m}`);
    current += intervalMinutes;
  }
  return slots;
}

/**
 * Helper: check if two time ranges overlap
 * Times are "HH:MM" strings, durations in minutes
 */
function slotsOverlap(time1, duration1, time2, duration2) {
  const toMin = (t) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const start1 = toMin(time1);
  const end1 = start1 + duration1;
  const start2 = toMin(time2);
  const end2 = start2 + duration2;
  return start1 < end2 && start2 < end1;
}

// ─── GET / ──────────────────────────────────────────────────────────────────
// List all calendars for tenant (with appointment counts)
router.get('/', authMiddleware, (req, res) => {
  try {
    const calendars = db.prepare(
      `SELECT c.*,
        (SELECT COUNT(*) FROM appointments a WHERE a.calendar_id = c.id AND a.status != 'cancelled') as appointment_count
       FROM calendars c
       WHERE c.tenant_id = ?
       ORDER BY c.created_at ASC`
    ).all(req.tenant.id);

    res.json({ calendars, total: calendars.length });
  } catch (err) {
    console.error('Error listing calendars:', err);
    res.status(500).json({ error: 'Failed to list calendars' });
  }
});

// ─── GET /:id/slots?date=YYYY-MM-DD ────────────────────────────────────────
// Must be registered before /:id to avoid route conflict
router.get('/:id/slots', authMiddleware, (req, res) => {
  try {
    const calendar = db.prepare(
      'SELECT * FROM calendars WHERE id = ? AND tenant_id = ?'
    ).get(req.params.id, req.tenant.id);

    if (!calendar) return res.status(404).json({ error: 'Calendar not found' });

    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'date query parameter is required (YYYY-MM-DD)' });

    // Check if the requested date falls on a working day
    const requestedDate = new Date(date + 'T00:00:00');
    // getDay(): 0=Sun, 1=Mon, ... 6=Sat
    const dayOfWeek = requestedDate.getDay();
    // Convert to our format: 1=Mon, ..., 7=Sun
    const dayNumber = dayOfWeek === 0 ? 7 : dayOfWeek;

    const workingDays = calendar.working_days.split(',').map(d => parseInt(d.trim()));
    if (!workingDays.includes(dayNumber)) {
      return res.json({ date, calendar_id: calendar.id, slots: [], message: 'Not a working day' });
    }

    const slotDuration = calendar.slot_duration || 30;
    const allSlots = generateTimeSlots(calendar.working_hours_start, calendar.working_hours_end, slotDuration);

    // Parse break times
    const toMin = (t) => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };
    const breakStart = toMin(calendar.break_start);
    const breakEnd = toMin(calendar.break_end);

    // Filter out slots that overlap with the break period
    const workSlots = allSlots.filter((time) => {
      const slotStart = toMin(time);
      const slotEnd = slotStart + slotDuration;
      // Slot overlaps break if it starts before break ends AND ends after break starts
      return !(slotStart < breakEnd && slotEnd > breakStart);
    });

    // Fetch existing bookings for this date on this calendar (exclude cancelled)
    const booked = db.prepare(
      `SELECT time, duration_minutes FROM appointments
       WHERE tenant_id = ? AND calendar_id = ? AND date = ? AND status != 'cancelled'`
    ).all(req.tenant.id, req.params.id, date);

    const slots = workSlots.map((time) => {
      const overlapping = booked.some((b) =>
        slotsOverlap(time, slotDuration, b.time, b.duration_minutes || slotDuration)
      );
      return { time, available: !overlapping };
    });

    res.json({ date, calendar_id: calendar.id, slot_duration: slotDuration, slots });
  } catch (err) {
    console.error('Error fetching calendar slots:', err);
    res.status(500).json({ error: 'Failed to fetch available slots' });
  }
});

// ─── GET /:id ───────────────────────────────────────────────────────────────
router.get('/:id', authMiddleware, (req, res) => {
  try {
    const calendar = db.prepare(
      'SELECT * FROM calendars WHERE id = ? AND tenant_id = ?'
    ).get(req.params.id, req.tenant.id);

    if (!calendar) return res.status(404).json({ error: 'Calendar not found' });
    res.json(calendar);
  } catch (err) {
    console.error('Error fetching calendar:', err);
    res.status(500).json({ error: 'Failed to fetch calendar' });
  }
});

// ─── POST / ─────────────────────────────────────────────────────────────────
router.post('/', authMiddleware, (req, res) => {
  try {
    const {
      name, description, color, timezone,
      working_hours_start, working_hours_end, slot_duration,
      break_start, break_end, working_days, is_active
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }

    const id = uuid();
    db.prepare(
      `INSERT INTO calendars (id, tenant_id, name, description, color, timezone,
        working_hours_start, working_hours_end, slot_duration,
        break_start, break_end, working_days, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      req.tenant.id,
      name.trim(),
      description || '',
      color || '#22c55e',
      timezone || 'UTC',
      working_hours_start || '09:00',
      working_hours_end || '18:00',
      slot_duration != null ? parseInt(slot_duration) : 30,
      break_start || '12:00',
      break_end || '13:00',
      working_days || '1,2,3,4,5',
      is_active != null ? (is_active ? 1 : 0) : 1
    );

    const calendar = db.prepare('SELECT * FROM calendars WHERE id = ?').get(id);
    res.status(201).json(calendar);
  } catch (err) {
    console.error('Error creating calendar:', err);
    res.status(500).json({ error: 'Failed to create calendar' });
  }
});

// ─── PUT /:id ───────────────────────────────────────────────────────────────
router.put('/:id', authMiddleware, (req, res) => {
  try {
    const existing = db.prepare(
      'SELECT * FROM calendars WHERE id = ? AND tenant_id = ?'
    ).get(req.params.id, req.tenant.id);
    if (!existing) return res.status(404).json({ error: 'Calendar not found' });

    const {
      name, description, color, timezone,
      working_hours_start, working_hours_end, slot_duration,
      break_start, break_end, working_days, is_active
    } = req.body;

    db.prepare(
      `UPDATE calendars SET
        name = ?, description = ?, color = ?, timezone = ?,
        working_hours_start = ?, working_hours_end = ?, slot_duration = ?,
        break_start = ?, break_end = ?, working_days = ?, is_active = ?,
        updated_at = datetime('now')
       WHERE id = ? AND tenant_id = ?`
    ).run(
      name !== undefined ? name.trim() : existing.name,
      description !== undefined ? description : existing.description,
      color !== undefined ? color : existing.color,
      timezone !== undefined ? timezone : existing.timezone,
      working_hours_start !== undefined ? working_hours_start : existing.working_hours_start,
      working_hours_end !== undefined ? working_hours_end : existing.working_hours_end,
      slot_duration != null ? parseInt(slot_duration) : existing.slot_duration,
      break_start !== undefined ? break_start : existing.break_start,
      break_end !== undefined ? break_end : existing.break_end,
      working_days !== undefined ? working_days : existing.working_days,
      is_active != null ? (is_active ? 1 : 0) : existing.is_active,
      req.params.id,
      req.tenant.id
    );

    const updated = db.prepare('SELECT * FROM calendars WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    console.error('Error updating calendar:', err);
    res.status(500).json({ error: 'Failed to update calendar' });
  }
});

// ─── DELETE /:id ────────────────────────────────────────────────────────────
router.delete('/:id', authMiddleware, (req, res) => {
  try {
    const existing = db.prepare(
      'SELECT id FROM calendars WHERE id = ? AND tenant_id = ?'
    ).get(req.params.id, req.tenant.id);
    if (!existing) return res.status(404).json({ error: 'Calendar not found' });

    // Check for future appointments on this calendar
    const today = new Date().toISOString().slice(0, 10);
    const futureAppointments = db.prepare(
      `SELECT COUNT(*) as cnt FROM appointments
       WHERE calendar_id = ? AND tenant_id = ? AND date >= ? AND status != 'cancelled'`
    ).get(req.params.id, req.tenant.id, today);

    if (futureAppointments.cnt > 0) {
      return res.status(409).json({
        error: 'Cannot delete calendar with future appointments',
        future_appointment_count: futureAppointments.cnt
      });
    }

    db.prepare('DELETE FROM calendars WHERE id = ? AND tenant_id = ?')
      .run(req.params.id, req.tenant.id);

    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting calendar:', err);
    res.status(500).json({ error: 'Failed to delete calendar' });
  }
});

module.exports = router;
