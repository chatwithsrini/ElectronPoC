/**
 * Dentrix Core Data Service
 *
 * Mirrors the .NET DentrixCorePlugin and AppointmentADO data access.
 * Uses Dentrix Service for connection string, then ODBC bridge for queries.
 *
 * Flow (matches .NET):
 * 1. Connection string: DentrixService getConnectionInfo -> Dentrix.API.dll
 * 2. Queries: ODBC via dentrixOdbcBridge (mirrors OdbcConnection in .NET)
 */

const dentrixCoreCredentials = require('./dentrixCoreCredentials');
const dentrixOdbcBridge = require('./dentrixOdbcBridge');

/**
 * Get Dentrix practice info (siteId, sourceId).
 * Mirrors DentrixFacade.GetDentrixPracticeInfo and DentrixCoreConfig.GetDentrixPracticeInfo
 *
 * Query: SELECT TOP 1 id1, practicename FROM admin.rsc WHERE rsctype=0
 *
 * @param {string} connectionString - ODBC connection string
 * @returns {Promise<Object>} { success, siteId, sourceId, error }
 */
async function getDentrixPracticeInfo(connectionString) {
  if (!connectionString) {
    return { success: false, error: 'Connection string is required' };
  }

  // Try TOP 1 (SQL Server/Sybase) first; fallback to LIMIT 1 (MySQL)
  const queries = [
    'SELECT TOP 1 id1, practicename FROM admin.rsc WHERE rsctype=0',
    'SELECT id1, practicename FROM admin.rsc WHERE rsctype=0 LIMIT 1',
  ];

  for (const query of queries) {
    const result = await dentrixOdbcBridge.executeOdbcQuery(connectionString, query, []);

    if (!result.success) continue;
    if (!result.rows || result.rows.length === 0) continue;

    const row = result.rows[0];
    const id1 = row.id1 ? String(row.id1).trim() : '';
    const practicename = row.practicename ? String(row.practicename).trim() : '';

    const sourceId = id1 ? id1.split('-')[0] : '';
    const siteId = practicename;

    return {
      success: true,
      siteId,
      sourceId,
      practiceInfo: { id1, practicename },
    };
  }

  return {
    success: false,
    error: 'Could not read practice info from admin.rsc',
  };
}

/**
 * Get appointment IDs for a date range.
 * Mirrors AppointmentADO.GetAppointmentIds
 *
 * @param {string} connectionString - ODBC connection string
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Promise<Object>} { success, appointmentIds: string[], error }
 */
async function getDentrixAppointmentIds(connectionString, startDate, endDate) {
  if (!connectionString) {
    return { success: false, appointmentIds: [], error: 'Connection string is required' };
  }

  const query = `
    SELECT appt.appointment_id
    FROM admin.v_appt appt
    WHERE appt.modified_time_stamp BETWEEN ? AND ?
    AND appt.broken = 0
  `.trim();

  const start = startDate instanceof Date ? startDate : new Date(startDate);
  const end = endDate instanceof Date ? endDate : new Date(endDate);

  const result = await dentrixOdbcBridge.executeOdbcQuery(connectionString, query, [start, end]);

  if (!result.success) {
    return { success: false, appointmentIds: [], error: result.error };
  }

  const appointmentIds = (result.rows || [])
    .map((r) => (r.appointment_id != null ? String(r.appointment_id).trim() : null))
    .filter(Boolean);

  return { success: true, appointmentIds };
}

/**
 * Get appointments with patient and insurance details.
 * Mirrors AppointmentADO.GetAppointments (simplified - returns raw rows for flexibility)
 *
 * @param {string} connectionString - ODBC connection string
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Promise<Object>} { success, appointments: Object[], error }
 */
async function getDentrixAppointments(connectionString, startDate, endDate) {
  if (!connectionString) {
    return { success: false, appointments: [], error: 'Connection string is required' };
  }

  const query = `
    SELECT DISTINCT
      a.appointment_id,
      TIMESTAMPADD(MINUTE, a.start_minute, TIMESTAMPADD(HOUR, a.start_hour, a.appointment_date)) as appointment_date,
      a.start_hour, a.reason, a.status_id, a.operatory_id, a.amount,
      pt.patient_id, pt.patient_guid, pt.first_name, pt.last_name, pt.home_phone, pt.birth_date,
      pt.city, pt.state, pt.zipcode, pt.address_line2, pt.address_line1, pt.gender,
      ip.ins_co_name, ip.group_name,
      p_sub.social_sec_num AS Prim_Subscriber_SSN,
      p_sub.first_name AS Prim_Subscriber_FirstName, p_sub.last_name AS Prim_Subscriber_LastName,
      p_sub.salutation AS Prim_Subscriber_Title, p_sub.birth_date AS Prim_Subscriber_BirthDate,
      p_sub.gender AS Prim_Subscriber_Gender,
      p_sub.address_line1 AS Prim_Subscriber_Street1, p_sub.address_line2 AS Prim_Subscriber_Street2,
      p_sub.city AS Prim_Subscriber_City, p_sub.state AS Prim_Subscriber_State, p_sub.zipcode AS Prim_Subscriber_Zipcode,
      pat.priminsrel AS Prim_Relationship_To_Patient,
      p_e.employer_name AS Prim_Employer_Name, p_e.address_line1 AS Prim_Employer_Street1,
      p_e.address_line2 AS Prim_Employer_Street2, p_e.city AS Prim_Employer_City,
      p_e.state AS Prim_Employer_State, p_e.zip_code AS Prim_Employer_Zipcode, p_e.phone AS Prim_Employer_Phone,
      ip.ins_co_name as Prim_InsuranceCompany_Name,
      ip.address_line1 as Prim_InsuranceCompany_Street1, ip.address_line2 as Prim_InsuranceCompany_Street2,
      ip.city as Prim_InsuranceCompany_City, ip.state as Prim_InsuranceCompany_State, ip.zipcode as Prim_InsuranceCompany_Zipcode,
      ip.payor_id as Prim_InsuranceCompany_PayerId,
      ins.id_num, ip.group_number,
      sec_ins.id_num as Sec_MemberId,
      sec_ip.ins_co_name as Sec_InsuranceCompany_Name,
      sec_ip.address_line1 as Sec_InsuranceCompany_Street1, sec_ip.address_line2 as Sec_InsuranceCompany_Street2,
      sec_ip.city as Sec_InsuranceCompany_City, sec_ip.state as Sec_InsuranceCompany_State, sec_ip.zipcode as Sec_InsuranceCompany_Zipcode,
      sec_ip.payor_id as Sec_InsuranceCompany_PayerId, sec_ip.group_number as Sec_Insurance_GroupNumber,
      s_sub.social_sec_num AS Sec_Subscriber_SSN, s_sub.first_name AS Sec_Subscriber_FirstName, s_sub.last_name AS Sec_Subscriber_LastName,
      s_sub.salutation AS Sec_Subscriber_Title, s_sub.birth_date AS Sec_Subscriber_BirthDate, s_sub.gender AS Sec_Subscriber_Gender,
      s_sub.address_line1 AS Sec_Subscriber_Street1, s_sub.address_line2 AS Sec_Subscriber_Street2,
      s_sub.city AS Sec_Subscriber_City, s_sub.state AS Sec_Subscriber_State, s_sub.zipcode AS Sec_Subscriber_Zipcode
    FROM admin.v_appt a
    INNER JOIN admin.v_patient pt ON a.patient_id = pt.patient_id
    INNER JOIN admin.patient pat ON pat.patid = pt.patient_id
    LEFT JOIN admin.v_patient_insurance vp ON vp.patient_id = pt.patient_id
    LEFT JOIN admin.v_insurance_plans ip ON vp.primary_insurance_carrier_id = ip.ins_id
    LEFT JOIN admin.v_insured ins ON ins.insured_id = vp.primary_insured_id AND ip.ins_id = ins.ins_plan_id AND ins.ins_type = 0
    LEFT JOIN admin.v_patient p_sub ON p_sub.patient_id = ins.ins_party_id
    LEFT JOIN admin.v_insurance_plans sec_ip ON vp.secondary_insurance_carrier_id = sec_ip.ins_id
    LEFT JOIN admin.v_insured sec_ins ON vp.secondary_insured_id IS NOT NULL AND sec_ins.insured_id = vp.secondary_insured_id AND sec_ip.ins_id = sec_ins.ins_plan_id AND sec_ins.ins_type = 0
    LEFT JOIN admin.v_patient s_sub ON s_sub.patient_id = sec_ins.ins_party_id
    LEFT JOIN admin.v_employers p_e ON p_e.employer_id = pt.employer_id
    WHERE a.modified_time_stamp BETWEEN ? AND ?
    AND a.broken = 0
  `.trim();

  const start = startDate instanceof Date ? startDate : new Date(startDate);
  const end = endDate instanceof Date ? endDate : new Date(endDate);
  const startDateOnly = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endDateOnly = new Date(end.getFullYear(), end.getMonth(), end.getDate());

  const result = await dentrixOdbcBridge.executeOdbcQuery(connectionString, query, [startDateOnly, endDateOnly]);

  if (!result.success) {
    return { success: false, appointments: [], error: result.error };
  }

  return { success: true, appointments: result.rows || [] };
}

/**
 * Get providers for given appointment IDs.
 * Mirrors AppointmentADO.GetProviders
 *
 * @param {string} connectionString - ODBC connection string
 * @param {string[]} appointmentIds - Appointment IDs
 * @returns {Promise<Object>} { success, providersByAppointmentId: { [apptId]: providers[] }, error }
 */
async function getDentrixProviders(connectionString, appointmentIds) {
  if (!connectionString || !appointmentIds || appointmentIds.length === 0) {
    return { success: true, providersByAppointmentId: {} };
  }

  const placeholders = appointmentIds.map(() => '?').join(', ');
  const query = `
    SELECT a.appointment_id, pt.patient_id, pr.provider_id,
      pr.first_name AS provider_first_name, pr.last_name AS provider_last_name,
      pr.npi, pr.tin, pr.ssn AS provider_ssn,
      pr.address_line1 AS provider_address1, pr.address_line2 AS provider_address2,
      pr.city AS provider_city, pr.state AS provider_state, pr.work_phone AS provider_work_phone,
      pr.suffix AS provider_suffix, pr.zip_code AS provider_zipcode, pr.issecondaryprovider
    FROM admin.v_appt a
    INNER JOIN admin.v_provider pr ON (a.provider_id = pr.provider_id OR a.addtnl_provider_id = pr.provider_id)
    INNER JOIN admin.v_patient pt ON a.patient_id = pt.patient_id
    WHERE pr.inactive = 0 AND a.appointment_id IN (${placeholders})
  `.trim();

  const result = await dentrixOdbcBridge.executeOdbcQuery(connectionString, query, appointmentIds);

  if (!result.success) {
    return { success: false, providersByAppointmentId: {}, error: result.error };
  }

  const providersByAppointmentId = {};
  for (const row of result.rows || []) {
    const apptId = row.appointment_id ? String(row.appointment_id).trim() : null;
    if (!apptId) continue;

    const provider = {
      provider_id: row.provider_id,
      first_name: row.provider_first_name,
      last_name: row.provider_last_name,
      npi: row.npi,
      tin: row.tin,
      ssn: row.provider_ssn,
      address: {
        street1: row.provider_address1,
        street2: row.provider_address2,
        city: row.provider_city,
        state: row.provider_state,
        zip: row.provider_zipcode,
      },
      isSecondaryProvider: row.issecondaryprovider === '1' || row.issecondaryprovider === 1,
    };

    if (!providersByAppointmentId[apptId]) providersByAppointmentId[apptId] = [];
    providersByAppointmentId[apptId].push(provider);
  }

  return { success: true, providersByAppointmentId };
}

/**
 * Full flow: Get connection string from Dentrix Service, then fetch practice info.
 * Mirrors MainForm.PopulateDentrixCoreConnectionString + DentrixCoreConfig.GetDentrixPracticeInfo
 *
 * @param {string} [dentrixServicePath] - Path to Dentrix Service executable
 * @returns {Promise<Object>} { success, connectionString, siteId, sourceId, config, error }
 */
async function getDentrixConnectionAndPracticeInfo(dentrixServicePath) {
  const connResult = await dentrixCoreCredentials.getDentrixCoreConnectionString(dentrixServicePath);

  if (!connResult.success) {
    return {
      success: false,
      error: connResult.error,
      hint: connResult.hint,
    };
  }

  const practiceResult = await getDentrixPracticeInfo(connResult.connectionString);

  if (!practiceResult.success) {
    return {
      success: true,
      connectionString: connResult.connectionString,
      config: dentrixCoreCredentials.parseOdbcConnectionString(connResult.connectionString),
      siteId: null,
      sourceId: null,
      practiceInfoError: practiceResult.error,
    };
  }

  return {
    success: true,
    connectionString: connResult.connectionString,
    config: dentrixCoreCredentials.parseOdbcConnectionString(connResult.connectionString),
    siteId: practiceResult.siteId,
    sourceId: practiceResult.sourceId,
    practiceInfo: practiceResult.practiceInfo,
  };
}

module.exports = {
  getDentrixPracticeInfo,
  getDentrixAppointmentIds,
  getDentrixAppointments,
  getDentrixProviders,
  getDentrixConnectionAndPracticeInfo,
};
