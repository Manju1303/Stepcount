import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  LogIn, 
  Upload, 
  BarChart3, 
  LogOut, 
  CheckCircle2, 
  Calendar, 
  User, 
  FileSpreadsheet,
  Zap,
  Loader2,
  Trash2
} from 'lucide-react';
import Tesseract from 'tesseract.js';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { mockStaffMembers, ADMIN_CREDENTIALS } from './data';

// --- Services ---

const processScreenshot = async (image) => {
  const result = await Tesseract.recognize(image, 'eng');
  const text = result.data.text.toLowerCase();
  
  // Basic regex to find step count (looking for numbers followed by 'steps')
  const stepMatch = text.match(/(\d{1,3},?\d{3}|\d{1,5})\s*(steps|step)/i);
  const steps = stepMatch ? parseInt(stepMatch[1].replace(',', '')) : 0;
  
  // Date and Time (Attempting to find common patterns)
  // This is a naive implementation; in a real app, you'd want more robust parsing
  const now = new Date();
  const date = now.toLocaleDateString('en-CA'); // YYYY-MM-DD
  const time = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });

  return { steps, date, time };
};

const exportToExcelFull = async (records, title = 'Staff Step Count Report', staffMember = null) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Report');

  // Title and Header
  worksheet.mergeCells('A1:E1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = title;
  titleCell.font = { name: 'Arial', size: 16, bold: true };
  titleCell.alignment = { horizontal: 'center' };

  if (staffMember) {
    worksheet.mergeCells('A2:E2');
    const subTitle = worksheet.getCell('A2');
    subTitle.value = `Staff: ${staffMember.name} | Dept: ${staffMember.dept}`;
    subTitle.font = { name: 'Arial', size: 12 };
    subTitle.alignment = { horizontal: 'center' };
  }

  // Setup Columns
  worksheet.columns = [
    { header: 'S.No', key: 'sno', width: 10 },
    { header: 'Date', key: 'date', width: 15 },
    { header: 'Steps', key: 'steps', width: 15 },
    { header: 'Name', key: 'name', width: 25 },
    { header: 'Department', key: 'dept', width: 25 },
  ];

  // Table Header Styling
  const headerRow = worksheet.getRow(staffMember ? 4 : 3);
  headerRow.values = ['S.No', 'Date', 'Steps', 'Name', 'Department'];
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } };
    cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    cell.alignment = { horizontal: 'center' };
  });

  // Data
  records.sort((a, b) => new Date(a.date) - new Date(b.date)).forEach((rec, index) => {
    const staff = mockStaffMembers.find(s => s.id === rec.staffId) || {};
    const row = worksheet.addRow([
      index + 1,
      rec.date,
      rec.steps,
      staff.name || 'N/A',
      staff.dept || 'N/A'
    ]);
    
    row.eachCell((cell) => {
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      cell.alignment = { horizontal: 'center' };
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([buffer]), `${title.replace(/\s+/g, '_')}.xlsx`);
};

// --- Components ---

const Navbar = ({ user, onLogout }) => (
  <nav className="navbar" style={{ padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <div className="logo-icon" style={{ background: 'var(--primary)', padding: '8px', borderRadius: '12px' }}>
        <Zap size={24} color="white" />
      </div>
      <h2 className="title-gradient">Antigravity Steps</h2>
    </div>
    {user && (
      <button onClick={onLogout} className="btn-primary" style={{ background: 'rgba(244, 63, 94, 0.1)', color: '#f43f5e', border: '1px solid rgba(244, 63, 94, 0.2)' }}>
        <LogOut size={18} /> Logout
      </button>
    )}
  </nav>
);

const Login = ({ onLogin }) => {
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (id === ADMIN_CREDENTIALS.id && password === ADMIN_CREDENTIALS.password) {
      onLogin({ role: 'admin', id });
    } else {
      const staff = mockStaffMembers.find(s => s.id === id);
      if (staff) {
        onLogin({ role: 'staff', ...staff });
      } else {
        setError('Invalid ID. Please use S001, S002, etc.');
      }
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card login-card" style={{ maxWidth: '400px', margin: '100px auto' }}>
      <h1 style={{ marginBottom: '1.5rem', textAlign: 'center' }}>Welcome Back</h1>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Staff/Admin ID</label>
          <input className="input-field" type="text" value={id} onChange={(e) => setId(e.target.value)} placeholder="Enter ID (e.g. S001)" required />
        </div>
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Password</label>
          <input className="input-field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
        </div>
        {error && <p style={{ color: 'var(--accent)', marginBottom: '1rem', textAlign: 'center' }}>{error}</p>}
        <button type="submit" className="btn-primary" style={{ width: '100%' }}>
          <LogIn size={20} /> Sign In
        </button>
      </form>
      <p style={{ marginTop: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
        Admin ID: <b>admin</b> | Password: <b>admin</b>
      </p>
    </motion.div>
  );
};

const StaffDashboard = ({ user, records, setRecords }) => {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().substring(0, 7)); // YYYY-MM

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const extracted = await processScreenshot(preview);
      setResult(extracted);
      
      const newRecord = {
        id: Date.now(),
        staffId: user.id,
        ...extracted,
        image: preview
      };
      
      const updatedRecords = [...records, newRecord];
      setRecords(updatedRecords);
      localStorage.setItem('step_records', JSON.stringify(updatedRecords));
      
      setFile(null);
    } catch (err) {
      console.error(err);
      alert('Failed to process image');
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e) => {
    const f = e.target.files[0];
    if (f) {
      setFile(f);
      const reader = new FileReader();
      reader.onloadend = () => setPreview(reader.result);
      reader.readAsDataURL(f);
      setResult(null);
    }
  };

  const staffHistory = records.filter(r => r.staffId === user.id).sort((a, b) => b.id - a.id);
  const monthlyRecords = staffHistory.filter(r => r.date.startsWith(selectedMonth));

  const handleMonthlyDownload = () => {
    exportToExcelFull(monthlyRecords, `Step Count Report - ${selectedMonth}`, user);
  };

  return (
    <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) 2fr', gap: '2rem', padding: '0 2rem' }}>
      <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
        <div className="glass-card">
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{ width: '80px', height: '80px', background: 'var(--primary)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
              <User size={40} color="white" />
            </div>
            <h2>{user.name}</h2>
            <p style={{ color: 'var(--text-muted)' }}>{user.dept}</p>
          </div>
          
          <div className="upload-container" style={{ border: '2px dashed var(--glass-border)', padding: '2rem', borderRadius: '16px', textAlign: 'center', cursor: 'pointer' }}>
            <input type="file" id="screenshot" hidden onChange={handleFileChange} accept="image/*" />
            <label htmlFor="screenshot" style={{ cursor: 'pointer' }}>
              <Upload size={40} style={{ marginBottom: '1rem', color: 'var(--primary)' }} />
              <p>Click to upload screenshot</p>
            </label>
          </div>

          {preview && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ marginTop: '1.5rem' }}>
              <img src={preview} alt="preview" style={{ width: '100%', borderRadius: '12px', marginBottom: '1rem' }} />
              <button onClick={handleUpload} disabled={loading} className="btn-primary" style={{ width: '100%' }}>
                {loading ? <Loader2 className="animate-spin" /> : <BarChart3 size={20} />}
                {loading ? 'Analyzing...' : 'Extract Data'}
              </button>
            </motion.div>
          )}

          {result && (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="result-card" style={{ marginTop: '1rem', background: 'rgba(34, 197, 94, 0.1)', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(34, 197, 94, 0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--success)', marginBottom: '0.5rem' }}>
                <CheckCircle2 size={20} />
                <b>Extraction Complete</b>
              </div>
              <p>Steps: <b>{result.steps}</b> {result.steps >= 5000 ? '✅ Target Met!' : '❌ Target Missed'}</p>
              <p>Date: {result.date}</p>
              <p>Time: {result.time}</p>
            </motion.div>
          )}
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
        <div className="glass-card" style={{ height: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Calendar size={22} color="var(--primary)" /> Recent Activity
            </h3>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <input 
                type="month" 
                value={selectedMonth} 
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="input-field"
                style={{ marginBottom: 0, padding: '0.4rem', fontSize: '0.8rem', width: 'auto' }}
              />
              <button onClick={handleMonthlyDownload} className="btn-primary" style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }}>
                <FileSpreadsheet size={16} /> Monthly Report
              </button>
            </div>
          </div>
          <div className="history-list" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {monthlyRecords.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>No records for this month.</p>
            ) : (
              monthlyRecords.map(rec => (
                <div key={rec.id} className="history-item" style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '1rem', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h4 style={{ color: rec.steps >= 5000 ? 'var(--success)' : 'var(--text-main)' }}>{rec.steps} Steps</h4>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{rec.date} at {rec.time}</p>
                  </div>
                  <div style={{ background: rec.steps >= 5000 ? 'var(--success)' : 'var(--accent)', padding: '4px 12px', borderRadius: '20px', fontSize: '0.7rem', fontWeight: 'bold' }}>
                    {rec.steps >= 5000 ? 'COMPLETED' : 'INCOMPLETE'}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

const AdminDashboard = ({ records, setRecords }) => {
  const [selectedDate, setSelectedDate] = useState(new Date().toLocaleDateString('en-CA'));
  
  const filteredRecords = records.filter(r => r.date === selectedDate);
  const totalStaff = mockStaffMembers.length;
  const completedToday = new Set(filteredRecords.filter(r => r.steps >= 5000).map(r => r.staffId)).size;

  const handleDelete = (id) => {
    const updated = records.filter(r => r.id !== id);
    setRecords(updated);
    localStorage.setItem('step_records', JSON.stringify(updated));
  };

  return (
    <div style={{ padding: '0 2rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
        <div className="glass-card" style={{ textAlign: 'center' }}>
          <h4 style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Total Staff</h4>
          <h1 className="title-gradient">{totalStaff}</h1>
        </div>
        <div className="glass-card" style={{ textAlign: 'center' }}>
          <h4 style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Completed Today</h4>
          <h1 style={{ color: 'var(--success)' }}>{completedToday}</h1>
        </div>
        <div className="glass-card" style={{ textAlign: 'center' }}>
          <h4 style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Incomplete</h4>
          <h1 style={{ color: 'var(--accent)' }}>{totalStaff - completedToday}</h1>
        </div>
      </div>

      <div className="glass-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <div>
            <h3>Staff Monitoring Report</h3>
            <p style={{ color: 'var(--text-muted)' }}>Viewing records for {selectedDate}</p>
          </div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="input-field" style={{ marginBottom: 0, width: 'auto' }} />
            <button 
              onClick={() => exportToExcelFull(filteredRecords, `Daily_Step_Count_Report_${selectedDate}`)} 
              className="btn-primary"
            >
              <FileSpreadsheet size={20} /> Daily Report
            </button>
          </div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--glass-border)', textAlign: 'left', color: 'var(--text-muted)' }}>
              <th style={{ padding: '1rem' }}>Staff Name</th>
              <th>Department</th>
              <th>Steps</th>
              <th>Time</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {mockStaffMembers.map(staff => {
              const record = filteredRecords.find(r => r.staffId === staff.id);
              return (
                <tr key={staff.id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  <td style={{ padding: '1rem' }}>
                    <div style={{ fontWeight: 600 }}>{staff.name}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>ID: {staff.id}</div>
                  </td>
                  <td>{staff.dept}</td>
                  <td style={{ fontWeight: 'bold', color: record?.steps >= 5000 ? 'var(--success)' : (record ? 'var(--accent)' : 'inherit') }}>
                    {record ? record.steps : '---'}
                  </td>
                  <td>{record ? record.time : '---'}</td>
                  <td>
                    {record ? (
                      <motion.span 
                        animate={{ opacity: [1, 0.6, 1] }} 
                        transition={{ repeat: Infinity, duration: 2 }}
                        style={{ color: record.steps >= 5000 ? 'var(--success)' : 'var(--accent)', background: 'rgba(255,255,255,0.05)', padding: '4px 10px', borderRadius: '12px', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                      >
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: record.steps >= 5000 ? 'var(--success)' : 'var(--accent)' }} />
                        {record.steps >= 5000 ? 'Completed' : 'Partial'}
                      </motion.span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>Pending</span>
                    )}
                  </td>
                  <td>
                    {record && (
                      <button onClick={() => handleDelete(record.id)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                        <Trash2 size={18} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// --- Main App ---

function App() {
  const [user, setUser] = useState(null);
  const [records, setRecords] = useState([]);

  useEffect(() => {
    const saved = localStorage.getItem('step_records');
    if (saved) setRecords(JSON.parse(saved));
    
    const savedUser = localStorage.getItem('step_user');
    if (savedUser) setUser(JSON.parse(savedUser));
  }, []);

  const handleLogin = (userData) => {
    setUser(userData);
    localStorage.setItem('step_user', JSON.stringify(userData));
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('step_user');
  };

  return (
    <div className="app-container">
      <Navbar user={user} onLogout={handleLogout} />
      
      <main style={{ padding: '2rem 0' }}>
        <AnimatePresence mode="wait">
          {!user ? (
            <Login key="login" onLogin={handleLogin} />
          ) : user.role === 'admin' ? (
            <AdminDashboard key="admin" records={records} setRecords={setRecords} />
          ) : (
            <StaffDashboard key="staff" user={user} records={records} setRecords={setRecords} />
          )}
        </AnimatePresence>
      </main>

      <footer style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
        &copy; 2026 Antigravity Step Monitoring System • Faculty Wellness Initiative
      </footer>
    </div>
  );
}

export default App;
