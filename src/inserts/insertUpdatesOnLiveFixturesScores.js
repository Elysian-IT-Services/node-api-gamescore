import { getDbBySport } from '../utils/dbUtils.js';

// A missing/omitted score arrives as '', null, or undefined depending on the
// caller; none of those should overwrite an already-stored valid score (0 is
// a legitimate score and must not be treated as empty).
export function isValidScore(value) {
  return value !== '' && value !== null && value !== undefined;
}

export async function updateFixtureFields(game, requestBody) {
  const db = await getDbBySport(game);

  const {
    external_id,
    participants0_id,
    participants0_score,
    participants1_id,
    participants1_score,
    status,
    start_time,
    end_time,
  } = requestBody;

  if (!external_id) {
    throw new Error('El campo external_id es obligatorio');
  }

  // Buscar fixture por external_id
  const [rows] = await db.query(
    `
      SELECT 
        id,
        participants0_id,
        participants1_id,
        sport_alias,
        start_time
      FROM fixtures
      WHERE id = ? 
      LIMIT 1
    `,
    [external_id]
  );

  if (!rows.length) {
    throw new Error('No se encontró un fixture con ese external_id');
  }

  const fixture = rows[0];
  const id = fixture.id;
  const sport_alias = fixture.sport_alias;
  const current_p0_id = fixture.participants0_id?.toString() ?? null;
  const current_p1_id = fixture.participants1_id?.toString() ?? null;

  // Campos a actualizar
  const updates = {};
  
  // ✅ Actualizar scores según coincidencia de IDs
  if (participants0_id === current_p0_id) {
    if (isValidScore(participants0_score)) updates.participants0_score = participants0_score;
  } else if (participants0_id === current_p1_id) {
    if (isValidScore(participants0_score)) updates.participants1_score = participants0_score;
  }

  if (participants1_id === current_p0_id) {
    if (isValidScore(participants1_score)) updates.participants0_score = participants1_score;
  } else if (participants1_id === current_p1_id) {
    if (isValidScore(participants1_score)) updates.participants1_score = participants1_score;
  }

  // ✅ Actualizar status si está permitido
  const allowed_status = ['Started', 'Ended'];
  if (status && allowed_status.includes(status)) {
    updates.status = status;
  }

  // ✅ Guardar start_time (fixture_started) solo si todavía no tiene uno
  if (start_time !== undefined && start_time !== null && fixture.start_time == null) {
    updates.start_time = start_time;
  }

  // ✅ Actualizar end_time si viene en el payload
  if (end_time !== undefined && end_time !== null) {
    updates.end_time = end_time;
  }

  // 🔄 Si hay algo que actualizar, ejecuta el UPDATE
  if (Object.keys(updates).length > 0) {
    const setClause = Object.keys(updates)
      .map((key) => `${key} = ?`)
      .join(', ');

    const values = [...Object.values(updates), id];

    await db.query(`UPDATE fixtures SET ${setClause} WHERE id = ?`, values);
  }

  return {
    success: true,
    fixture_id: id,
    message: 'Scores y estado actualizados correctamente (IDs validados)',
    updates,
  };
}
