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
  Trash2,
  AlertCircle,
  Trophy,
  TrendingDown
} from 'lucide-react';
import Tesseract from 'tesseract.js';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { mockStaffMembers, ADMIN_CREDENTIALS } from './data';
import { supabase } from './supabaseClient';
import logo from './assets/logo.png';
import header from './assets/header.png';


// --- Services ---

const preprocessImage = (imageSrc) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      const isPortrait = img.height > img.width * 1.5;

      const cropX = isPortrait ? img.width * 0.2 : 0;
      const cropY = isPortrait ? img.height * 0.15 : 0;
      const cropWidth = isPortrait ? img.width * 0.6 : img.width;
      const cropHeight = isPortrait ? img.height * 0.20 : img.height;

      canvas.width = cropWidth * 2.5;
      canvas.height = cropHeight * 2.5;

      ctx.drawImage(
        img,
        cropX, cropY, cropWidth, cropHeight,
        0, 0, canvas.width, canvas.height
      );

      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;
      for (let i = 0; i < data.length; i += 4) {
        const avg = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        data[i] = data[i + 1] = data[i + 2] = avg;
      }
      ctx.putImageData(imgData, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = imageSrc;
  });
};

const processScreenshot = async (image) => {
  const processedImage = await preprocessImage(image);
  const result = await Tesseract.recognize(processedImage, 'eng');
  let text = result.data.text.toLowerCase();

  text = text.replace(/,/g, '');

  const rawTokens = text.split(/\s+/).filter(t => t.trim() !== '');

  let tokens = [];
  for (let i = 0; i < rawTokens.length; i++) {
    const t = rawTokens[i];

    if (t === 'move' && (rawTokens[i + 1] === 'min' || rawTokens[i + 1] === 'mins')) {
      if (tokens.length > 0 && /^\d+(\.\d+)?$/.test(tokens[tokens.length - 1])) tokens.pop();
      i++;
      continue;
    }

    if (/^(cal|kcal|calories|mi|miles|km|kilometers|min|mins|minutes|bpm|kg|lbs)$/i.test(t)) {
      if (tokens.length > 0 && /^\d+(\.\d+)?$/.test(tokens[tokens.length - 1])) tokens.pop();
      continue;
    }

    if (/^(2023|2024|2025|2026)$/.test(t)) {
      continue;
    }

    // New: If the token is just a single dot or comma, skip
    if (t === '.' || t === ',') continue;

    if (tokens.length > 0 && /^\d{1,2}$/.test(tokens[tokens.length - 1]) && /^\d{3}$/.test(t)) {
      tokens[tokens.length - 1] = tokens[tokens.length - 1] + t;
      continue;
    }

    tokens.push(t);
  }

  let steps = 0;
  
  // Strict Number Analysis
  const potentialSteps = [];
  
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (/^\d+$/.test(t)) {
      const val = parseInt(t);
      if (val > 150000) continue; // Out of range

      // Peek ahead to see if it's a unit we want to ignore
      const next = tokens[i+1];
      if (next && /^(cal|kcal|calories|mi|miles|km|kilometers|min|mins|minutes|bpm|kg|lbs)$/i.test(next)) {
        continue; 
      }
      
      potentialSteps.push(val);
    }
  }

  if (potentialSteps.length > 0) {
    // In most fitness apps, Steps is the largest multi-digit number
    // but Calories can also be large. Steps are usually > 2000 if active.
    // If we have a choice between a 1000-2000 number and a 4000-8000 number,
    // the larger one is almost certainly steps.
    const stepsCandidates = potentialSteps.filter(n => n > 100);
    if (stepsCandidates.length > 0) {
      // Pick the largest one as it's most likely the step count in this specific layout
      steps = Math.max(...stepsCandidates);
    } else {
      steps = Math.max(...potentialSteps);
    }
  }

  const now = new Date();
  const date = now.toLocaleDateString('en-CA');
  const time = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
  const uploadedTime = now.toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return { steps, date, time, uploadedTime };
};

const exportToExcelFull = async (records, title = 'Staff Step Count Report', staffMember = null, allExpectedStaff = null) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Report');

  worksheet.pageSetup.paperSize = 9; // A4
  worksheet.pageSetup.orientation = 'portrait';
  worksheet.pageSetup.fitToPage = true;
  worksheet.pageSetup.fitToWidth = 1;
  worksheet.pageSetup.fitToHeight = 0;
  worksheet.pageSetup.margins = { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 };

  // --- Header Implementation ---
  const addHeader = async () => {
    worksheet.getRow(1).height = 110;
    worksheet.mergeCells('A1:E1');
    
    try {
      const headerResp = await fetch(header);
      const headerBuf = await headerResp.arrayBuffer();
      const headerId = workbook.addImage({ buffer: headerBuf, extension: 'png' });
      // tl: { col: 0, row: 0 } means top-left of cell A1
      worksheet.addImage(headerId, { 
        tl: { col: 0, row: 0 }, 
        ext: { width: 550, height: 110 } 
      });
    } catch (e) { console.error("Header logo load failed", e); }

    const dayName = staffMember ? new Date(records[0]?.date).toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase() : new Date(title.split('-')[1]?.trim() || new Date()).toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
    const subTitles = [
      { text: "FACULTY WELFARE CLUB", font: { name: 'Times New Roman', size: 12, bold: true } },
      { text: "FITNESS ACTIVITY ATTENDANCE - 2026", font: { name: 'Times New Roman', size: 12, bold: true } },
      { text: `${title.toUpperCase()} ${dayName ? `- ${dayName} ` : ''}STEP COUNT NAMELIST`, font: { name: 'Times New Roman', size: 12, bold: true } }
    ];

    subTitles.forEach((st, i) => {
      const rowNum = i + 2; // Offset by header image row
      worksheet.mergeCells(`A${rowNum}:E${rowNum}`);
      const cell = worksheet.getCell(`A${rowNum}`);
      cell.value = st.text;
      cell.font = st.font;
      cell.alignment = { horizontal: 'center' };
      worksheet.getRow(rowNum).height = 20;
    });
  };

  await addHeader();

  // Column Config
  worksheet.getColumn(1).width = 6;   // S.NO
  worksheet.getColumn(2).width = 45;  // NAME AND DESIGNATION
  worksheet.getColumn(3).width = 15;  // STEP COUNT
  worksheet.getColumn(4).width = 20;  // TIMING
  worksheet.getColumn(5).width = 25;  // REMARKS

  const applyDataStyle = (row) => {
    row.eachCell((cell) => {
      cell.font = { name: 'Times New Roman', size: 11 };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    });
    row.getCell(1).alignment = { horizontal: 'center' };
    row.getCell(3).alignment = { horizontal: 'center' };
    row.getCell(4).alignment = { horizontal: 'center' };
    row.getCell(5).alignment = { horizontal: 'center' };
    row.height = 25;
  };

  const addTableHeader = (y) => {
    const row = worksheet.getRow(y);
    row.values = ['S.NO', 'NAME AND DESIGNATION', 'STEP COUNT', 'TIMING', 'REMARKS'];
    row.eachCell(c => {
      c.font = { name: 'Times New Roman', bold: true, size: 11 };
      c.border = { top: { style: 'medium' }, left: { style: 'medium' }, bottom: { style: 'medium' }, right: { style: 'medium' } };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    // Vertical text for S.NO
    row.getCell(1).alignment = { textRotation: 90, horizontal: 'center', vertical: 'middle' };
    row.height = 45;
  };

  let gSNo = 1;
  let curY = 6; // Start table at row 6
  addTableHeader(curY++);

  if (staffMember) {
    // Individual Report
    [...records].sort((a,b) => new Date(b.date) - new Date(a.date)).forEach((rec) => {
      const row = worksheet.addRow([gSNo++, `${rec.name || staffMember.name} - ${staffMember.dept}`, rec.steps, rec.uploaded_time || rec.time || 'N/A', rec.reason || '']);
      applyDataStyle(row);
    });
  } else {
    // Admin Report: Grouped by Department
    const principal = mockStaffMembers.find(s => s.id === 'principal');
    if (principal) {
      const rec = records.find(r => r.staff_id === 'principal');
      const row = worksheet.addRow([gSNo++, `${principal.name} - *Principal sir*`, rec ? rec.steps : 'ABSENT', rec ? (rec.uploaded_time || rec.time) : '', '']);
      applyDataStyle(row);
    }

    const depts = ['CSE', 'IT', 'MCA', 'AI&DS', 'Cyber Security', 'Automobile', 'Civil', 'ECE', 'EEE', 'Mech', 'S&H', 'COE', 'Exam Cell', 'Library', 'Placement', 'Admission', 'Office', 'MBA', 'Yoga', 'PD', 'FM Radio'];
    
    depts.forEach(deptName => {
      const deptStaff = mockStaffMembers.filter(s => s.dept.includes(deptName) && s.id !== 'principal');
      if (deptStaff.length === 0) return;

      const banner = worksheet.addRow([`*Department of ${deptName}*`]);
      worksheet.mergeCells(`A${banner.number}:E${banner.number}`);
      banner.font = { name: 'Times New Roman', bold: true, italic: true, size: 12 };
      banner.alignment = { horizontal: 'center' };
      banner.height = 28;
      
      deptStaff.forEach(staff => {
        const rec = records.find(r => r.staff_id === staff.id);
        const row = worksheet.addRow([gSNo++, `${staff.name} - ${staff.dept}`, rec ? rec.steps : 'ABSENT', rec ? (rec.uploaded_time || rec.time) : '', rec ? (rec.reason || '') : '']);
        applyDataStyle(row);
        if (!rec) row.eachCell(c => c.font = { name: 'Times New Roman', color: { argb: 'FF94A3B8' } });
      });
    });

    // Summary at the Bottom
    const total = allExpectedStaff ? allExpectedStaff.length : mockStaffMembers.length;
    const present = records.length;
    const absent = Math.max(0, total - present);

    worksheet.addRow([]);
    const summaryHeader = worksheet.addRow(['ATTENDANCE SUMMARY']);
    worksheet.mergeCells(`A${summaryHeader.number}:B${summaryHeader.number}`);
    summaryHeader.font = { name: 'Times New Roman', bold: true, underline: true, size: 12 };

    worksheet.addRow(['TOTAL STAFF', ':', total]).font = { name: 'Times New Roman', bold: true };
    worksheet.addRow(['PRESENT', ':', present]).font = { name: 'Times New Roman', bold: true };
    worksheet.addRow(['ABSENT', ':', absent]).font = { name: 'Times New Roman', bold: true };
    worksheet.addRow(['PENDING', ':', 'NIL']).font = { name: 'Times New Roman', bold: true };

    worksheet.addRow([]);
    worksheet.addRow([]);
    const sig = worksheet.addRow(['', '', '', '', 'PRINCIPAL SIGNATURE']);
    sig.getCell(5).font = { name: 'Times New Roman', bold: true };
    worksheet.addRow(['', '', '', '', '____________________']);
  }

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
      <button onClick={onLogout} className="btn-primary" style={{ background: '#fee2e2', color: '#ef4444', border: '1px solid #fecaca' }}>
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
      const staff = mockStaffMembers.find(s => s.id.toLowerCase() === id.toLowerCase());
      if (staff) {
        if (staff.password === password) {
          onLogin({ role: 'staff', ...staff });
        } else {
          setError('Incorrect password');
        }
      } else {
        setError('Invalid ID. Please check your Staff ID.');
      }
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card login-card" style={{ maxWidth: '400px', margin: '100px auto' }}>
      <h1 style={{ marginBottom: '1.5rem', textAlign: 'center' }}>Welcome Back</h1>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Staff/Admin ID</label>
          <input className="input-field" type="text" value={id} onChange={(e) => setId(e.target.value)} placeholder="Enter ID" required />
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
    </motion.div>
  );
};

const StaffDashboard = ({ user, records, setRecords }) => {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [reason, setReason] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().substring(0, 7));

  const handleExtract = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const extracted = await processScreenshot(preview);
      setResult(extracted);
      setReason('');
    } catch (err) {
      console.error(err);
      alert('Failed to process image');
    } finally {
      setLoading(false);
    }
  };

  const handleFinalSubmit = async () => {
    const stepsNum = result.steps;
    if (stepsNum < 5000 && !reason.trim()) {
      alert("Please provide a valid reason since your step count is below 5000.");
      return;
    }

    setLoading(true);
    try {
      const newRecord = {
        staff_id: user.id,
        name: user.name,
        dept: user.dept,
        department: user.dept,
        steps: stepsNum,
        date: result.date,
        time: result.time,
        uploaded_time: result.uploadedTime,
        reason: (stepsNum < 5000 && !reason.trim()) ? 'Steps below daily target (< 5000)' : reason,
      };

      const { data, error } = await supabase
        .from('step_records')
        .insert([newRecord])
        .select();

      if (error) throw error;

      if (data) {
        setRecords(prev => [...prev, data[0]]);
        setFile(null);
        setResult(null);
        alert("Report submitted successfully to Cloud!");
      }
    } catch (err) {
      console.error("Supabase Error:", err.message);
      alert("Error saving to cloud: " + err.message);
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

  const today = new Date().toLocaleDateString('en-CA');
  const hasUploadedToday = records.some(r => r.staff_id === user.id && r.date === today);

  const staffHistory = records.filter(r => r.staff_id === user.id).sort((a, b) => b.id - a.id);
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

          {hasUploadedToday ? (
            <div style={{ textAlign: 'center', padding: '2rem', background: '#f0fdf4', borderRadius: '16px', border: '1px solid #dcfce7' }}>
              <CheckCircle2 size={40} color="var(--success)" style={{ margin: '0 auto 1rem' }} />
              <h3 style={{ color: 'var(--success)' }}>Daily Submission Complete</h3>
              <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>You have already uploaded your step count for today. It cannot be changed or edited.</p>
            </div>
          ) : (
            <>
              {!preview && (
                <div className="upload-container" style={{ border: '2px dashed var(--glass-border)', padding: '2rem', borderRadius: '16px', textAlign: 'center', cursor: 'pointer' }}>
                  <input type="file" id="screenshot" hidden onChange={handleFileChange} accept="image/*" />
                  <label htmlFor="screenshot" style={{ cursor: 'pointer' }}>
                    <Upload size={40} style={{ marginBottom: '1rem', color: 'var(--primary)' }} />
                    <p>Click to upload screenshot</p>
                  </label>
                </div>
              )}

              {preview && !result && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ marginTop: '1.5rem' }}>
                  <img src={preview} alt="preview" style={{ width: '100%', borderRadius: '12px', marginBottom: '1rem' }} />
                  <button onClick={handleExtract} disabled={loading} className="btn-primary" style={{ width: '100%' }}>
                    {loading ? <Loader2 className="animate-spin" /> : <BarChart3 size={20} />}
                    {loading ? 'Processing Image...' : 'Process Image'}
                  </button>
                </motion.div>
              )}
            </>
          )}

          {result && (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="result-card" style={{ marginTop: '1rem', background: '#f0fdf4', padding: '1.5rem', borderRadius: '12px', border: '1px solid #dcfce7' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#166534', marginBottom: '1rem' }}>
                <CheckCircle2 size={20} />
                <b>Image Processed Successfully</b>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Validate/Correct Steps Count:</label>
                <input 
                  type="number"
                  value={result.steps}
                  onChange={(e) => setResult({...result, steps: parseInt(e.target.value) || 0})}
                  className="input-field"
                  style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--primary)', textAlign: 'center' }}
                />
              </div>

              {result.steps < 5000 && (
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--accent)' }}>Steps are below 5000. Please provide a reason:</label>
                  <input
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Enter reason here..."
                    className="input-field"
                    style={{ border: '1px solid #fecaca' }}
                  />
                </div>
              )}

              <div style={{ paddingBottom: '1.5rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                <p>Date: {result.date}</p>
                <p>Time: {result.time}</p>
              </div>

              <button onClick={handleFinalSubmit} className="btn-primary" style={{ width: '100%' }}>
                <CheckCircle2 size={18} /> Confirm & Submit Report
              </button>
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
                onClick={(e) => e.target.showPicker()}
                className="input-field"
                style={{ marginBottom: 0, padding: '0.4rem', fontSize: '0.8rem', width: 'auto', cursor: 'pointer' }}
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
                <div key={rec.id} className="history-item" style={{ background: 'white', border: '1px solid #f1f5f9', padding: '1rem', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                  <div>
                    <h4 style={{ color: rec.steps >= 5000 || rec.reason ? '#166534' : 'var(--text-main)' }}>
                      {rec.steps} Steps
                      {rec.reason && <span style={{ fontSize: '0.7rem', marginLeft: '6px', color: 'var(--text-muted)' }}>({rec.reason})</span>}
                    </h4>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{rec.date} at {rec.uploaded_time || rec.time}</p>
                  </div>
                  <div style={{ background: rec.steps >= 5000 || rec.reason ? '#dcfce7' : '#fee2e2', color: rec.steps >= 5000 || rec.reason ? '#166534' : '#991b1b', padding: '4px 12px', borderRadius: '20px', fontSize: '0.7rem', fontWeight: 'bold' }}>
                    {rec.steps >= 5000 || rec.reason ? 'COMPLETED' : 'INCOMPLETE'}
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
  const [filterDept, setFilterDept] = useState('All');
  const [sortOrder, setSortOrder] = useState('time');

  const filteredRecords = records.filter(r => r.date === selectedDate);
  const totalStaff = mockStaffMembers.length;
  const completedToday = new Set(filteredRecords.filter(r => r.steps >= 5000 || r.reason).map(r => r.staff_id)).size;

  const departments = ['All', ...new Set(mockStaffMembers.map(s => s.dept))];

  let displayStaff = mockStaffMembers.filter(s => filterDept === 'All' || s.dept === filterDept);

  displayStaff.sort((a, b) => {
    const recA = filteredRecords.find(r => r.staff_id === a.id);
    const recB = filteredRecords.find(r => r.staff_id === b.id);
    const stepsA = recA ? recA.steps : -1;
    const stepsB = recB ? recB.steps : -1;

    if (sortOrder === 'steps-high') return stepsB - stepsA;
    if (sortOrder === 'steps-low') {
      const sa = recA ? recA.steps : 999999;
      const sb = recB ? recB.steps : 999999;
      return sa - sb;
    }
    const timeA = recA ? recA.id : 0;
    const timeB = recB ? recB.id : 0;
    return timeB - timeA;
  });

  const exportRecords = filteredRecords.filter(r => {
    const staff = displayStaff.find(s => s.id === r.staff_id);
    return staff !== undefined;
  }).sort((a, b) => {
    if (sortOrder === 'steps-high') return b.steps - a.steps;
    if (sortOrder === 'steps-low') return a.steps - b.steps;
    return b.id - a.id;
  });

  const sortedByPerformance = [...filteredRecords].sort((a, b) => b.steps - a.steps);
  const topPerformers = sortedByPerformance.slice(0, 3);
  const bottomPerformers = [...sortedByPerformance].reverse().slice(0, 3);

  const handleDelete = async (id) => {
    if (!confirm("Are you sure you want to delete this record from Cloud?")) return;

    try {
      const { error } = await supabase
        .from('step_records')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setRecords(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      alert("Delete failed: " + err.message);
    }
  };

  return (
    <div style={{ padding: '0 2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px', marginBottom: '2rem', padding: '1.5rem', background: 'white', borderRadius: '20px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}>
        <img src={logo} alt="College Logo" style={{ height: '100px', width: 'auto' }} />
        <div style={{ textAlign: 'left' }}>
          <h1 style={{ margin: 0, color: 'var(--secondary)', fontSize: '1.8rem' }}>JKK Muniraja College of Technology</h1>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontWeight: 500 }}>Step Count Monitoring System • Admin Panel</p>
        </div>
      </div>
      <div className="admin-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
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

      {filteredRecords.length > 0 && (
        <div className="admin-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
          <div className="glass-card" style={{ padding: '1.5rem' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--success)' }}>
              <Trophy size={20} /> Top Performers
            </h3>
            <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              {topPerformers.map((r, i) => {
                const staff = mockStaffMembers.find(s => s.id === r.staff_id);
                return (
                  <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.8rem', background: 'white', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                      <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: i === 0 ? '#eab308' : '#94a3b8' }}>#{i + 1}</span>
                      <div>
                        <b>{staff?.name}</b>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{staff?.dept}</div>
                      </div>
                    </div>
                    <b style={{ color: '#16a34a', fontSize: '1.1rem' }}>{r.steps}</b>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="glass-card" style={{ padding: '1.5rem' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--accent)' }}>
              <TrendingDown size={20} /> Needs Attention
            </h3>
            <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              {bottomPerformers.map((r, i) => {
                const staff = mockStaffMembers.find(s => s.id === r.staff_id);
                return (
                  <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.8rem', background: 'white', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                      <div>
                        <b>{staff?.name}</b>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {r.steps < 5000 ? (r.reason ? `Reason: ${r.reason}` : 'Missing Reason') : staff?.dept}
                        </div>
                      </div>
                    </div>
                    <b style={{ color: r.steps >= 5000 ? 'var(--text-main)' : '#dc2626', fontSize: '1.1rem' }}>{r.steps}</b>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="glass-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '2rem' }}>
          <div>
            <h3>Staff Monitoring Report</h3>
            <p style={{ color: 'var(--text-muted)' }}>Viewing records for {selectedDate}</p>
          </div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>Date</label>
              <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} onClick={(e) => e.target.showPicker()} className="input-field" style={{ marginBottom: 0, width: 'auto', padding: '0.4rem', cursor: 'pointer' }} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>Department</label>
              <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)} className="input-field" style={{ marginBottom: 0, width: 'auto', padding: '0.4rem' }}>
                {departments.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>Sort</label>
              <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="input-field" style={{ marginBottom: 0, width: 'auto', padding: '0.4rem' }}>
                <option value="time">Recents First</option>
                <option value="steps-high">Steps (High to Low)</option>
                <option value="steps-low">Steps (Low to High)</option>
              </select>
            </div>

            <button
              onClick={() => exportToExcelFull(exportRecords, `Daily Report - ${selectedDate}`, null, mockStaffMembers)}
              className="btn-primary" style={{ padding: '0.5rem 1rem', height: '38px' }}
            >
              <FileSpreadsheet size={18} /> Export Filtered
            </button>
          </div>
        </div>
        <div className="table-wrapper">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--glass-border)', textAlign: 'left', color: 'var(--text-muted)' }}>
              <th style={{ padding: '1rem' }}>Staff Name</th>
              <th>Department</th>
              <th>Steps</th>
              <th>Reason</th>
              <th>Uploaded Time</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {displayStaff.map(staff => {
              const record = filteredRecords.find(r => r.staff_id === staff.id);
              return (
                <tr key={staff.id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  <td style={{ padding: '1rem' }}>
                    <div style={{ fontWeight: 600 }}>{staff.name}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>ID: {staff.id}</div>
                  </td>
                  <td>{staff.dept}</td>
                  <td style={{ fontWeight: 'bold', color: (record?.steps >= 5000 || record?.reason) ? '#16a34a' : (record ? '#dc2626' : 'inherit') }}>
                    {record ? record.steps : '---'}
                  </td>
                  <td>{record?.reason || '---'}</td>
                  <td>{record?.uploaded_time || record?.time || '---'}</td>
                  <td>
                    {record ? (
                      (record.steps >= 5000 || record.reason) ? (
                        <div className="status-badge status-complete">Completed</div>
                      ) : (
                        <div className="status-badge status-incomplete">Incomplete</div>
                      )
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
  </div>
);
};

// --- Main App ---

function App() {
  const [user, setUser] = useState(null);
  const [records, setRecords] = useState([]);

  useEffect(() => {
    const fetchCloudRecords = async () => {
      try {
        const { data, error } = await supabase
          .from('step_records')
          .select('*');
        if (error) throw error;
        setRecords(data || []);
      } catch (err) {
        console.error("Initial fetch error:", err);
      }
    };
    fetchCloudRecords();

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
