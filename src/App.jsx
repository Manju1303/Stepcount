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
    
    if (t === 'move' && (rawTokens[i+1] === 'min' || rawTokens[i+1] === 'mins')) {
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

// ✅ FIX 1: exportToExcelFull now reads name/department from Supabase records directly
const exportToExcelFull = async (records, title = 'Staff Step Count Report', staffMember = null) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Report');

  worksheet.pageSetup.paperSize = 9;
  worksheet.pageSetup.orientation = 'landscape';
  worksheet.pageSetup.fitToPage = true;
  worksheet.pageSetup.fitToWidth = 1;
  worksheet.pageSetup.fitToHeight = 0;
  worksheet.pageSetup.horizontalCentered = true;
  worksheet.pageSetup.margins = {
    left: 0.5, right: 0.5,
    top: 0.5, bottom: 0.5,
    header: 0.3, footer: 0.3
  };

  worksheet.mergeCells('A1:G1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = title;
  titleCell.font = { name: 'Arial', size: 16, bold: true };
  titleCell.alignment = { horizontal: 'center' };

  if (staffMember) {
    worksheet.mergeCells('A2:G2');
    const subTitle = worksheet.getCell('A2');
    subTitle.value = `Staff: ${staffMember.name} | Dept: ${staffMember.dept}`;
    subTitle.font = { name: 'Arial', size: 12 };
    subTitle.alignment = { horizontal: 'center' };
  }

  worksheet.columns = [
    { header: 'S.No', key: 'sno', width: 10 },
    { header: 'Date', key: 'date', width: 15 },
    { header: 'Steps', key: 'steps', width: 15 },
    { header: 'Name', key: 'name', width: 25 },
    { header: 'Department', key: 'dept', width: 25 },
    { header: 'Uploaded Time', key: 'uploadedTime', width: 20 },
    { header: 'Reason', key: 'reason', width: 25 },
  ];

  const headerRow = worksheet.getRow(staffMember ? 4 : 3);
  headerRow.values = ['S.No', 'Date', 'Steps', 'Name', 'Department', 'Uploaded Time', 'Reason'];
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } };
    cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });

  // ✅ FIX 2: Sort using Supabase fields directly — no more mockStaffMembers
  const sortedRecords = [...records].sort((a, b) => {
    const deptA = a.department || a.dept || '';
    const deptB = b.department || b.dept || '';
    if (deptA < deptB) return -1;
    if (deptA > deptB) return 1;
    return (a.name || '').localeCompare(b.name || '');
  });

  sortedRecords.forEach((rec, index) => {
    // ✅ FIX 3: Read name/department directly from Supabase record
    const row = worksheet.addRow([
      index + 1,
      rec.date,
      rec.steps,
      rec.name || 'N/A',
      rec.department || rec.dept || 'N/A',
      rec.uploaded_time || rec.uploadedTime || rec.time || 'N/A',  // ✅ FIX 4: handle both field names
      rec.reason || '---'
    ]);
    
    // ✅ Color red rows where steps < 5000
    const stepsCell = row.getCell(3);
    if (rec.steps < 5000) {
      stepsCell.font = { bold: true, color: { argb: 'FFCC0000' } };
    }

    row.eachCell((cell) => {
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
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
          <input className="input-field" type="text" value={id} onChange={(e) => setId(e.target.value)} placeholder="Enter ID (e.g. aids013)" required />
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
  const [submitted, setSubmitted] = useState(false); // ✅ FIX: success animation state
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

  // ✅ FIX 5: Duplicate date check + saves name & department + correct reason
  const handleFinalSubmit = async () => {
    const stepsNum = result.steps;

    if (stepsNum < 5000 && !reason.trim()) {
      alert("Please provide a valid reason since your step count is below 5000.");
      return;
    }

    // ✅ Check for duplicate submission for today from DB
    const today = result.date;
    const { data: existing } = await supabase
      .from('step_records')
      .select('id')
      .eq('staff_id', user.id)
      .eq('date', today);

    if (existing && existing.length > 0) {
      alert("You have already submitted your step count for today. Only one submission per day is allowed.");
      return;
    }
    
    setLoading(true);
    try {
      const newRecord = {
        staff_id: user.id,
        name: user.name,                                        // ✅ FIXED: save name
        department: user.dept,                                  // ✅ FIXED: save department
        dept: user.dept,
        steps: stepsNum,
        date: result.date,
        time: result.time,
        uploaded_time: result.uploadedTime,
        reason: stepsNum < 5000 ? reason.trim() : 'Good',      // ✅ FIXED: 'Good' when steps >= 5000
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
        setPreview(null);
        setSubmitted(true); // ✅ trigger success animation
        setTimeout(() => setSubmitted(false), 3000);
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

  // ✅ FIX 6: Check today's upload from actual records array (reliable after page refresh)
  const hasUploadedToday = records.some(r => r.staff_id === user.id && r.date === today);

  // ✅ FIX 7: staffHistory filters by current user correctly
  const staffHistory = records
    .filter(r => r.staff_id === user.id)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  // ✅ FIX 8: monthlyRecords correctly filters by selected month
  const monthlyRecords = staffHistory.filter(r => r.date && r.date.startsWith(selectedMonth));

  const handleMonthlyDownload = () => {
    if (monthlyRecords.length === 0) {
      alert("No records found for this month.");
      return;
    }
    exportToExcelFull(monthlyRecords, `Step Count Report - ${selectedMonth}`, user);
  };

  // Step badge helper
  const getStepBadge = (steps) => {
    if (steps >= 10000) return { icon: '🏆', color: '#166534', bg: '#dcfce7', label: 'Excellent' };
    if (steps >= 5000)  return { icon: '✅', color: '#1d4ed8', bg: '#dbeafe', label: 'Good' };
    return { icon: '⚠️', color: '#92400e', bg: '#fef3c7', label: 'Below Target' };
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

          {/* ✅ FIX 9: Success animation after submit */}
          <AnimatePresence>
            {submitted && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                style={{ textAlign: 'center', padding: '1.5rem', background: 'rgba(34,197,94,0.1)', borderRadius: '16px', border: '1px solid rgba(34,197,94,0.3)', marginBottom: '1rem' }}
              >
                <div style={{ fontSize: '3rem' }}>🎉</div>
                <h3 style={{ color: 'var(--success)', marginTop: '0.5rem' }}>Submitted Successfully!</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Your step count has been saved.</p>
              </motion.div>
            )}
          </AnimatePresence>
          
          {hasUploadedToday ? (
            <div style={{ textAlign: 'center', padding: '2rem', background: 'rgba(34, 197, 94, 0.1)', borderRadius: '16px', border: '1px solid rgba(34, 197, 94, 0.2)' }}>
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
                    <p>Click to upload Google Fit screenshot</p>
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
                <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: result.steps >= 5000 ? 'var(--primary)' : '#ef4444' }}>
                  {result.steps.toLocaleString()} {result.steps >= 5000 ? '🏆' : '⚠️'}
                </div>
              </div>

              {/* ✅ FIX 10: Show reason input only when steps < 5000 */}
              {result.steps < 5000 && (
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#ef4444' }}>
                    ⚠️ Steps below 5000. Please provide a reason (e.g., On-Duty, Sick Leave):
                  </label>
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
                <p>📅 Date: {result.date}</p>
                <p>🕐 Time: {result.time}</p>
              </div>

              <button onClick={handleFinalSubmit} disabled={loading} className="btn-primary" style={{ width: '100%' }}>
                {loading ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
                {loading ? 'Submitting...' : 'Confirm & Submit Report'}
              </button>
            </motion.div>
          )}
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
        <div className="glass-card" style={{ height: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Calendar size={22} color="var(--pri
