const mysql = require('mysql2/promise');

const config = {
  host: 'localhost',
  user: 'root',
  password: 'root',
  database: 'patrol'
};

async function seed() {
  const conn = await mysql.createConnection(config);
  console.log('Seeding Patrol-AI database...');

  try {
    // STATIONS
    await conn.query(`DELETE FROM patrol_waypoints`);
    await conn.query(`DELETE FROM patrols`);
    await conn.query(`DELETE FROM incidents`);
    await conn.query(`DELETE FROM crimes`);
    await conn.query(`DELETE FROM officers`);
    await conn.query(`DELETE FROM hotspots`);
    await conn.query(`DELETE FROM stations`);

    await conn.query(`
      INSERT INTO stations (name, address, lat, lng, phone) VALUES
      ('Central Police Station', 'Civil Lines, Prayagraj', 25.4358, 81.8463, '0532-2440200'),
      ('Colonelganj Police Station', 'Colonelganj, Prayagraj', 25.4580, 81.8300, '0532-2440201'),
      ('Kareli Police Station', 'Kareli, Prayagraj', 25.4200, 81.8800, '0532-2440202'),
      ('Naini Police Station', 'Naini, Prayagraj', 25.3900, 81.8900, '0532-2440203')
    `);
    console.log('Stations seeded');

    // HOTSPOTS
    await conn.query(`
      INSERT INTO hotspots (zone_name, description, lat, lng, risk_score, risk_level) VALUES
      ('Civil Lines Market', 'High footfall commercial area', 25.4485, 81.8520, 78, 'HIGH'),
      ('Allahpur Crossing', 'Busy intersection, frequent snatching', 25.4350, 81.8830, 85, 'HIGH'),
      ('George Town', 'Mixed residential-commercial zone', 25.4600, 81.8450, 62, 'MEDIUM'),
      ('Rambagh Area', 'Night crime hotspot', 25.4700, 81.8600, 91, 'CRITICAL'),
      ('Naini Bridge', 'Vehicle theft prone area', 25.3950, 81.8950, 55, 'MEDIUM'),
      ('Johnsonganj', 'Old city, low visibility', 25.4520, 81.8390, 45, 'LOW'),
      ('Chowk Market', 'Dense market, pickpocketing', 25.4420, 81.8510, 73, 'HIGH'),
      ('Phaphamau', 'Outer area, limited patrol', 25.5200, 81.8750, 58, 'MEDIUM'),
      ('Dhoomanganj', 'Drug-related activity reports', 25.4150, 81.8650, 80, 'HIGH'),
      ('Teliarganj', 'Gang activity observed', 25.4250, 81.8200, 68, 'MEDIUM')
    `);
    console.log('Hotspots seeded');

    // OFFICERS
    await conn.query(`
      INSERT INTO officers (name, badge_number, designation, phone, email, shift, status, station_id) VALUES
      ('Rajesh Kumar Singh', 'UP001', 'Inspector', '9839012345', 'rsingh@uppolice.in', 'morning', 'available', 1),
      ('Priya Sharma', 'UP002', 'SI', '9839012346', 'psharma@uppolice.in', 'morning', 'available', 1),
      ('Amit Verma', 'UP003', 'ASI', '9839012347', 'averma@uppolice.in', 'evening', 'available', 2),
      ('Sunita Yadav', 'UP004', 'Constable', '9839012348', 'syadav@uppolice.in', 'evening', 'on_duty', 2),
      ('Mohd. Irfan', 'UP005', 'Head Constable', '9839012349', 'mirfan@uppolice.in', 'night', 'available', 3),
      ('Deepak Mishra', 'UP006', 'SI', '9839012350', 'dmishra@uppolice.in', 'morning', 'available', 1),
      ('Kavita Tiwari', 'UP007', 'Constable', '9839012351', 'ktiwari@uppolice.in', 'night', 'available', 4),
      ('Ramesh Patel', 'UP008', 'ASI', '9839012352', 'rpatel@uppolice.in', 'evening', 'available', 3),
      ('Anjali Gupta', 'UP009', 'Constable', '9839012353', 'agupta@uppolice.in', 'morning', 'off_duty', 2),
      ('Vinod Chauhan', 'UP010', 'Inspector', '9839012354', 'vchauhan@uppolice.in', 'evening', 'available', 1)
    `);
    console.log('Officers seeded');

    // CRIMES (past 60 days)
    const crimeTypes = ['Theft', 'Robbery', 'Assault', 'Burglary', 'Vandalism', 'Drug Offense', 'Eve Teasing', 'Fraud'];
    const severities = ['low', 'medium', 'high'];
    const statuses = ['open', 'investigating', 'resolved'];

    const crimes = [];
    for (let i = 0; i < 80; i++) {
      const daysAgo = Math.floor(Math.random() * 60);
      const date = new Date();
      date.setDate(date.getDate() - daysAgo);
      date.setHours(Math.floor(Math.random() * 24));

      const areaId = Math.floor(Math.random() * 10) + 1;
      const type = crimeTypes[Math.floor(Math.random() * crimeTypes.length)];
      const sev = severities[Math.floor(Math.random() * severities.length)];
      const status = statuses[Math.floor(Math.random() * statuses.length)];

      crimes.push([
        type,
        `${type} reported in the area. Case under investigation.`,
        areaId, null, null, sev, status,
        date.toISOString().slice(0, 19).replace('T', ' '),
        `Citizen Report #${1000 + i}`
      ]);
    }

    for (const crime of crimes) {
      await conn.query(
        `INSERT INTO crimes (crime_type, description, area_id, latitude, longitude, severity, status, occurred_at, reported_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        crime
      );
    }
    console.log('80 Crimes seeded');

    // PATROLS
    await conn.query(`
      INSERT INTO patrols (officer_id, route_data, start_time, end_time, status, notes) VALUES
      (1, '{"optimization":"nearest-neighbor"}', DATE_SUB(NOW(), INTERVAL 2 HOUR), NULL, 'active', 'High priority patrol'),
      (2, '{"optimization":"nearest-neighbor"}', DATE_SUB(NOW(), INTERVAL 5 HOUR), DATE_SUB(NOW(), INTERVAL 1 HOUR), 'completed', 'Evening round'),
      (3, '{"optimization":"nearest-neighbor"}', DATE_ADD(NOW(), INTERVAL 1 HOUR), DATE_ADD(NOW(), INTERVAL 5 HOUR), 'scheduled', 'Night shift patrol'),
      (6, '{"optimization":"nearest-neighbor"}', DATE_SUB(NOW(), INTERVAL 3 HOUR), DATE_SUB(NOW(), INTERVAL 30 MINUTE), 'completed', 'Market area coverage')
    `);

    // PATROL WAYPOINTS
    await conn.query(`
      INSERT INTO patrol_waypoints (patrol_id, area_id, lat, lng, sequence_order, status) VALUES
      (1, 4, 25.4700, 81.8600, 1, 'reached'),
      (1, 1, 25.4485, 81.8520, 2, 'pending'),
      (1, 7, 25.4420, 81.8510, 3, 'pending'),
      (2, 2, 25.4350, 81.8830, 1, 'reached'),
      (2, 9, 25.4150, 81.8650, 2, 'reached'),
      (3, 5, 25.3950, 81.8950, 1, 'pending'),
      (3, 8, 25.5200, 81.8750, 2, 'pending')
    `);
    console.log('Patrols seeded');

    console.log('\nDatabase seeded successfully!');
    console.log('Summary:');
    console.log('   • 4 Police Stations');
    console.log('   • 10 Crime Hotspots');
    console.log('   • 10 Officers');
    console.log('   • 80 Crime Records');
    console.log('   • 4 Patrol Assignments');

  } catch (err) {
    console.error('Seed error:', err);
  } finally {
    await conn.end();
  }
}

seed();