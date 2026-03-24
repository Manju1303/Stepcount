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

    if (tokens.length > 0 && /^\d{1,2}$/.test(tokens[tokens.length - 1]) && /^\d{3}$/.test(t)) {
      tokens[tokens.length - 1] = tokens[tokens.length - 1] + t;
      continue;
    }

    tokens.push(t);
  }

  let steps = 0;

  const nums = tokens.filter(t => /^\d+$/.test(t)).map(n => parseInt(n));
  const validNums = nums.filter(n => n <= 150000);

  if (validNums.length > 0) {
    steps = Math.max(...validNums);
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
  worksheet.pageSetup.horizontalCentered = true;
  worksheet.pageSetup.margins = {
    left: 0.3, right: 0.3,
    top: 0.5, bottom: 0.5,
    header: 0.3, footer: 0.3
  };

  // Add Page Header/Footer
  worksheet.headerFooter.oddHeader = `&C&14&B${title.toUpperCase()}`;
  worksheet.headerFooter.oddFooter = `&L&D &T &CPage &P of &N &RAntigravity Step Monitoring`;

  worksheet.mergeCells('A1:G1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = title.toUpperCase();
  titleCell.font = { name: 'Arial Black', size: 16, bold: true, color: { argb: 'FF1E293B' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getRow(1).height = 35;

  // Set compressed column widths for A4 portrait
  worksheet.getColumn(1).width = 6;  // S.No
  worksheet.getColumn(2).width = 12; // Date
  worksheet.getColumn(3).width = 10; // Steps
  worksheet.getColumn(4).width = 25; // Name
  worksheet.getColumn(5).width = 20; // Department
  worksheet.getColumn(6).width = 15; // Uploaded Time
  worksheet.getColumn(7).width = 25; // Reason



  if (staffMember) {
    worksheet.mergeCells('A2:G2');
    const subTitle = worksheet.getCell('A2');
    subTitle.value = `MONTHLY PERFORMANCE REPORT: ${staffMember.name} (ID: ${staffMember.id}) | DEPARTMENT: ${staffMember.dept}`;
    subTitle.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FF475569' } };
    subTitle.alignment = { horizontal: 'center' };
    worksheet.getRow(2).height = 25;
  }

  // Helper to get clean department name
  const getDept = (r) => {
    let d = r.department || r.dept || mockStaffMembers.find(s => s.id === r.staff_id)?.dept || 'N/A';
    if (d.toUpperCase().includes('AI&DS') || d.toUpperCase().includes('AIDS')) return 'AI&DS';
    if (d.toUpperCase().includes('CSE')) return 'CSE';
    return d.includes('/') ? d.split('/')[1].trim() : d.trim();
  };

  const addTableHeader = (y) => {
    const headerRow = worksheet.getRow(y);
    headerRow.values = ['S.No', 'Date', 'Steps', 'Name', 'Department', 'Uploaded Time', 'Reason'];
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });
    headerRow.height = 25;
    return headerRow;
  };

  const applyDataStyle = (row) => {
    row.eachCell((cell) => {
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });
  };

  let gSNo = 1;

  // CASE 1: INDIVIDUAL STAFF REPORT
  if (staffMember) {
    addTableHeader(4);
    const sorted = [...records].sort((a, b) => new Date(b.date) - new Date(a.date));
    sorted.forEach((rec, idx) => {
      const row = worksheet.addRow([
        idx + 1,
        rec.date,
        rec.steps,
        rec.name || staffMember.name,
        getDept(rec),
        rec.uploaded_time || rec.time || 'N/A',
        rec.reason || '---'
      ]);
      applyDataStyle(row);
      if (rec.steps < 5000) row.getCell(3).font = { bold: true, color: { argb: 'FFEF4444' } };
    });
  }
  // CASE 2: ADMIN REPORT (TABLE PER DEPARTMENT)
  else {
    const completed = records.filter(r => r.steps >= 5000);
    const incomplete = records.filter(r => r.steps < 5000);

    // 1. Tables for Each Department
    const depts = [...new Set(completed.map(getDept))].sort();

    depts.forEach(deptName => {
      worksheet.addRow([]); // Spacer
      worksheet.addRow([]); // Spacer

      const deptBanner = worksheet.addRow([`TABLE: STAFF REPORT - DEPARTMENT OF ${deptName}`]);
      worksheet.mergeCells(`A${deptBanner.number}:G${deptBanner.number}`);
      deptBanner.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
      deptBanner.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } };
      deptBanner.alignment = { horizontal: 'center' };
      deptBanner.height = 30;

      addTableHeader(worksheet.lastRow.number + 1);

      const deptRecords = completed.filter(r => getDept(r) === deptName).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      deptRecords.forEach(rec => {
        const staffMap = mockStaffMembers.find(s => s.id === rec.staff_id) || {};
        const row = worksheet.addRow([
          gSNo++,
          rec.date,
          rec.steps,
          rec.name || staffMap.name || 'N/A',
          deptName,
          rec.uploaded_time || rec.time || 'N/A',
          rec.reason || '---'
        ]);
        applyDataStyle(row);
      });
    });

    // 2. Incomplete Table at the End
    if (incomplete.length > 0) {
      worksheet.addRow([]);
      worksheet.addRow([]);
      worksheet.addRow([]);

      const incBanner = worksheet.addRow(['TABLE: INCOMPLETE SUBMISSIONS (BELOW 5000 STEPS)']);
      worksheet.mergeCells(`A${incBanner.number}:G${incBanner.number}`);
      incBanner.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
      incBanner.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEF4444' } }; // Red for incomplete
      incBanner.alignment = { horizontal: 'center' };
      incBanner.height = 30;

      addTableHeader(worksheet.lastRow.number + 1);

      incomplete.forEach(rec => {
        const staffMap = mockStaffMembers.find(s => s.id === rec.staff_id) || {};
        const row = worksheet.addRow([
          gSNo++,
          rec.date,
          rec.steps,
          rec.name || staffMap.name || 'N/A',
          getDept(rec),
          rec.uploaded_time || rec.time || 'N/A',
          rec.reason || '---'
        ]);
        applyDataStyle(row);
        row.getCell(3).font = { bold: true, color: { argb: 'FFEF4444' } };
        row.getCell(7).font = { bold: true, color: { argb: 'FFEF4444' } };
      });
    }

    // 3. Pending Table
    if (allExpectedStaff) {
      const pendingStaff = allExpectedStaff.filter(s => !records.some(r => r.staff_id === s.id));
      if (pendingStaff.length > 0) {
        worksheet.addRow([]);
        worksheet.addRow([]);

        const penBanner = worksheet.addRow(['TABLE: PENDING SUBMISSIONS (NOT YET UPLOADED)']);
        worksheet.mergeCells(`A${penBanner.number}:G${penBanner.number}`);
        penBanner.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
        penBanner.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF64748B' } }; // Gray for pending
        penBanner.alignment = { horizontal: 'center' };
        penBanner.height = 30;

        const pHead = worksheet.addRow(['S.No', 'Date', 'Steps', 'Name', 'Department', 'Status', 'Notes']);
        pHead.eachCell(c => {
          c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
          c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
          c.alignment = { horizontal: 'center' };
        });

        pendingStaff.forEach((staff) => {
          const row = worksheet.addRow([
            gSNo++,
            records.length > 0 ? records[0].date : new Date().toLocaleDateString('en-CA'),
            '---',
            staff.name,
            staff.dept,
            'PENDING',
            'No report discovered for this date'
          ]);
          applyDataStyle(row);
        });
      }
    }
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
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Extracted Steps Count:</label>
                <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--primary)' }}>
                  {result.steps}
                </div>
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

      {filteredRecords.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
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
              onClick={() => exportToExcelFull(exportRecords, `Daily Report - ${selectedDate}`, null, displayStaff)}
              className="btn-primary" style={{ padding: '0.5rem 1rem', height: '38px' }}
            >
              <FileSpreadsheet size={18} /> Export Filtered
            </button>
          </div>
        </div>

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
                      <motion.span
                        animate={{ opacity: [1, 0.6, 1] }}
                        transition={{ repeat: Infinity, duration: 2 }}
                        style={{ color: (record.steps >= 5000 || record.reason) ? '#166534' : '#991b1b', background: (record.steps >= 5000 || record.reason) ? '#dcfce7' : '#fee2e2', padding: '4px 10px', borderRadius: '12px', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                      >
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: (record.steps >= 5000 || record.reason) ? '#166534' : '#991b1b' }} />
                        {(record.steps >= 5000 || record.reason) ? 'Completed' : 'Partial'}
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
