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
  TrendingDown,
  AlertTriangle,
  Bell,
  Clock,
  ShieldAlert
} from 'lucide-react';
import Tesseract from 'tesseract.js';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { mockStaffMembers, ADMIN_CREDENTIALS } from './data';
import { pastRecords } from './pastRecords';
import { supabase } from './supabaseClient';
import { cleanText, tokenize, extractSteps, detect90DayDuplicates, findDuplicateAlertsInPeriod } from './extractionLogic';
import logo from './assets/logo.png';
import header from './assets/header.png';


// --- Services ---

const preprocessImage = (imageSrc, shouldCrop = true) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      const ratio = img.height / img.width;
      const isFullPortrait = ratio > 1.7 && shouldCrop; // Standard phone screen ratio & crop allowed

      // Only crop if it's a full-length portrait screenshot and cropping is enabled
      // Otherwise (smartwatch, square, pre-cropped, or fallback), use the whole image
      const cropX = isFullPortrait ? img.width * 0.05 : 0;
      const cropY = isFullPortrait ? img.height * 0.08 : 0;
      const cropWidth = isFullPortrait ? img.width * 0.90 : img.width;
      const cropHeight = isFullPortrait ? img.height * 0.75 : img.height;

      canvas.width = cropWidth * 2;
      canvas.height = cropHeight * 2;

      ctx.drawImage(
        img,
        cropX, cropY, cropWidth, cropHeight,
        0, 0, canvas.width, canvas.height
      );

      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;
      const width = canvas.width;
      const height = canvas.height;

      // Calculate average brightness to auto-detect light/dark mode
      let totalBrightness = 0;
      for (let i = 0; i < data.length; i += 4) {
        totalBrightness += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      }
      const avgBrightness = totalBrightness / (data.length / 4);

      // Perform adaptive binarization - Tesseract requires dark text on white background
      if (avgBrightness > 127) {
        // Light background mode (e.g. phone white theme)
        // Convert dark/colored text (brightness < 190) to pure black, and background to pure white.
        for (let i = 0; i < data.length; i += 4) {
          const avg = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
          const finalVal = avg < 190 ? 0 : 255;
          data[i] = data[i + 1] = data[i + 2] = finalVal;
        }
      } else {
        // Dark background mode (e.g. smartwatch / AMOLED dark theme)
        // Invert to black text on clean white background so Tesseract recognizes numbers cleanly!
        for (let i = 0; i < data.length; i += 4) {
          const avg = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
          const finalVal = avg > 65 ? 0 : 255;
          data[i] = data[i + 1] = data[i + 2] = finalVal;
        }
      }

      ctx.putImageData(imgData, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = imageSrc;
  });
};

// Specialized contrast enhancer for real smartwatch camera photos taken on staff wrists
const preprocessSmartwatchPhoto = (imageSrc) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = img.width * 2;
      canvas.height = img.height * 2;

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;

      // Apply Grayscale + Contrast boost (1.6x) to preserve watch screen text against skin/ambient background
      const contrast = 40;
      const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

      for (let i = 0; i < data.length; i += 4) {
        const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        const contrastVal = factor * (gray - 128) + 128;
        const finalVal = Math.min(255, Math.max(0, contrastVal));
        data[i] = data[i + 1] = data[i + 2] = finalVal;
      }

      ctx.putImageData(imgData, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = imageSrc;
  });
};

const processScreenshot = async (image) => {
  // Pass 1: Try processing with standard portrait cropping
  let processedImage = await preprocessImage(image, true);
  let result = await Tesseract.recognize(processedImage, 'eng');
  let text = result.data.text;
  let cleaned = cleanText(text);
  let tokens = tokenize(cleaned);
  let steps = extractSteps(tokens);

  // Pass 2: Fallback to full uncropped image if 0 steps found (common for cropped smartwatch images)
  if (steps === 0) {
    processedImage = await preprocessImage(image, false);
    result = await Tesseract.recognize(processedImage, 'eng');
    text = result.data.text;
    cleaned = cleanText(text);
    tokens = tokenize(cleaned);
    steps = extractSteps(tokens);
  }

  // Pass 3: Smartwatch camera photo on wrist fallback (ambient lighting & skin background)
  if (steps === 0) {
    processedImage = await preprocessSmartwatchPhoto(image);
    result = await Tesseract.recognize(processedImage, 'eng');
    text = result.data.text;
    cleaned = cleanText(text);
    tokens = tokenize(cleaned);
    steps = extractSteps(tokens);
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

    // Extract date from title "Daily Report - YYYY-MM-DD" or similar
    const dateMatch = title.match(/\d{4}-\d{2}-\d{2}/);
    const reportDateStr = staffMember && records[0] ? records[0].date : (dateMatch ? dateMatch[0] : new Date().toLocaleDateString('en-CA'));
    const dayName = new Date(reportDateStr).toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
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
    worksheet.addRow(['PENDING', ':', absent]).font = { name: 'Times New Roman', bold: true, color: { argb: 'FFDC2626' } };

    worksheet.addRow([]);
    worksheet.addRow([]);
    const sig = worksheet.addRow(['', '', '', '', 'PRINCIPAL SIGNATURE']);
    sig.getCell(5).font = { name: 'Times New Roman', bold: true };
    worksheet.addRow(['', '', '', '', '____________________']);

    // Dedicated Pending Staff worksheet in the same workbook
    const pendingSheet = workbook.addWorksheet('Pending Staff');
    pendingSheet.getColumn(1).width = 8;
    pendingSheet.getColumn(2).width = 18;
    pendingSheet.getColumn(3).width = 40;
    pendingSheet.getColumn(4).width = 25;
    pendingSheet.getColumn(5).width = 22;

    const pTitle = pendingSheet.addRow([`PENDING / NOT SUBMITTED SCREENSHOT LIST - ${reportDateStr}`]);
    pendingSheet.mergeCells('A1:E1');
    pTitle.font = { name: 'Times New Roman', bold: true, size: 13, color: { argb: 'FF991B1B' } };
    pTitle.alignment = { horizontal: 'center' };
    pTitle.height = 30;

    const pHeader = pendingSheet.addRow(['S.NO', 'STAFF ID', 'NAME AND DESIGNATION', 'DEPARTMENT', 'STATUS']);
    pHeader.eachCell(c => {
      c.font = { name: 'Times New Roman', bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF991B1B' } };
      c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    pHeader.height = 28;

    let pSNo = 1;
    const allStaffList = allExpectedStaff || mockStaffMembers;
    allStaffList.forEach(staff => {
      const rec = records.find(r => r.staff_id === staff.id);
      if (!rec) {
        const row = pendingSheet.addRow([pSNo++, staff.id, `${staff.name} - ${staff.dept}`, staff.dept, 'NOT SUBMITTED']);
        row.eachCell(c => {
          c.font = { name: 'Times New Roman', size: 11 };
          c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
          c.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
        });
        row.getCell(1).alignment = { horizontal: 'center' };
        row.getCell(2).alignment = { horizontal: 'center' };
        row.getCell(5).alignment = { horizontal: 'center' };
        row.getCell(5).font = { name: 'Times New Roman', size: 11, bold: true, color: { argb: 'FFDC2626' } };
        row.height = 22;
      }
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([buffer]), `${title.replace(/\s+/g, '_')}.xlsx`);
};

const exportPendingListExcel = async (dateStr, allStaff, dayRecords) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Pending List');

  worksheet.pageSetup.paperSize = 9; // A4
  worksheet.pageSetup.orientation = 'portrait';
  worksheet.pageSetup.fitToPage = true;
  worksheet.pageSetup.fitToWidth = 1;
  worksheet.pageSetup.fitToHeight = 0;
  worksheet.pageSetup.margins = { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 };

  worksheet.getRow(1).height = 110;
  worksheet.mergeCells('A1:E1');
  try {
    const headerResp = await fetch(header);
    const headerBuf = await headerResp.arrayBuffer();
    const headerId = workbook.addImage({ buffer: headerBuf, extension: 'png' });
    worksheet.addImage(headerId, { tl: { col: 0, row: 0 }, ext: { width: 550, height: 110 } });
  } catch (e) {
    console.error("Header load failed", e);
  }

  const dayName = new Date(dateStr).toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
  const subTitles = [
    "FACULTY WELFARE CLUB",
    "FITNESS ACTIVITY ATTENDANCE - 2026",
    `PENDING / NOT SUBMITTED SCREENSHOT LIST - ${dateStr} (${dayName})`
  ];

  subTitles.forEach((st, i) => {
    const rowNum = i + 2;
    worksheet.mergeCells(`A${rowNum}:E${rowNum}`);
    const cell = worksheet.getCell(`A${rowNum}`);
    cell.value = st;
    cell.font = { name: 'Times New Roman', size: 12, bold: true, color: { argb: i === 2 ? 'FF991B1B' : 'FF000000' } };
    cell.alignment = { horizontal: 'center' };
    worksheet.getRow(rowNum).height = 20;
  });

  worksheet.getColumn(1).width = 8;   // S.NO
  worksheet.getColumn(2).width = 16;  // STAFF ID
  worksheet.getColumn(3).width = 40;  // NAME AND DESIGNATION
  worksheet.getColumn(4).width = 25;  // DEPARTMENT
  worksheet.getColumn(5).width = 25;  // STATUS

  const headerRow = worksheet.getRow(6);
  headerRow.values = ['S.NO', 'STAFF ID', 'STAFF NAME', 'DEPARTMENT', 'SUBMISSION STATUS'];
  headerRow.eachCell(c => {
    c.font = { name: 'Times New Roman', bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF991B1B' } };
    c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  headerRow.height = 30;

  const staffList = allStaff || mockStaffMembers;
  const submittedIds = new Set(dayRecords.filter(r => r.date === dateStr && r.steps).map(r => r.staff_id));
  const pendingStaff = staffList.filter(s => !submittedIds.has(s.id));

  let curY = 7;
  pendingStaff.forEach((s, idx) => {
    const row = worksheet.addRow([idx + 1, s.id, `${s.name} - ${s.dept}`, s.dept, 'NOT SUBMITTED']);
    row.eachCell(c => {
      c.font = { name: 'Times New Roman', size: 11 };
      c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      c.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    });
    row.getCell(1).alignment = { horizontal: 'center' };
    row.getCell(2).alignment = { horizontal: 'center' };
    row.getCell(5).alignment = { horizontal: 'center' };
    row.getCell(5).font = { name: 'Times New Roman', size: 11, bold: true, color: { argb: 'FFDC2626' } };
    row.height = 22;
  });

  worksheet.addRow([]);
  const sum1 = worksheet.addRow(['ATTENDANCE SUMMARY']);
  worksheet.mergeCells(`A${sum1.number}:B${sum1.number}`);
  sum1.font = { name: 'Times New Roman', bold: true, underline: true, size: 12 };
  worksheet.addRow(['TOTAL STAFF', ':', staffList.length]).font = { name: 'Times New Roman', bold: true };
  worksheet.addRow(['SUBMITTED', ':', submittedIds.size]).font = { name: 'Times New Roman', bold: true };
  worksheet.addRow(['PENDING', ':', pendingStaff.length]).font = { name: 'Times New Roman', bold: true, color: { argb: 'FFDC2626' } };

  worksheet.addRow([]);
  worksheet.addRow([]);
  const sig = worksheet.addRow(['', '', '', '', 'PRINCIPAL SIGNATURE']);
  sig.getCell(5).font = { name: 'Times New Roman', bold: true };
  worksheet.addRow(['', '', '', '', '____________________']);

  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([buffer]), `Pending_Staff_Report_${dateStr}.xlsx`);
};


// --- Components ---

const Navbar = ({ user, onLogout, installPrompt, onInstall }) => (
  <nav className="navbar" style={{ padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <div className="logo-icon" style={{ background: 'var(--primary)', padding: '8px', borderRadius: '12px' }}>
        <Zap size={24} color="white" />
      </div>
      <h2 className="title-gradient">Staff Fit</h2>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      {installPrompt && (
        <button onClick={onInstall} className="btn-primary" style={{ background: '#e0e7ff', color: '#4338ca', border: '1px solid #c7d2fe', padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
          📲 Install App
        </button>
      )}
      {user && (
        <button onClick={onLogout} className="btn-primary" style={{ background: '#fee2e2', color: '#ef4444', border: '1px solid #fecaca' }}>
          <LogOut size={18} /> Logout
        </button>
      )}
    </div>
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

const StaffDashboard = ({ user }) => {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [reason, setReason] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().substring(0, 7));
  const [records, setRecords] = useState([]);
  const [loadingRecords, setLoadingRecords] = useState(false);

  useEffect(() => {
    const fetchStaffRecords = async () => {
      setLoadingRecords(true);
      try {
        const { data, error } = await supabase
          .from('step_records')
          .select('*')
          .eq('staff_id', user.id);
        
        const staffPast = pastRecords.filter(r => r.staff_id === user.id);
        const recordMap = new Map();
        staffPast.forEach(r => recordMap.set(r.date, r));
        (data || []).forEach(r => recordMap.set(r.date, r));
        setRecords(Array.from(recordMap.values()).sort((a,b) => new Date(b.date) - new Date(a.date)));
      } catch (err) {
        console.warn("Staff fetch fallback to past records:", err);
        const staffPast = pastRecords.filter(r => r.staff_id === user.id);
        setRecords(staffPast.sort((a,b) => new Date(b.date) - new Date(a.date)));
      } finally {
        setLoadingRecords(false);
      }
    };
    if (user && user.id) {
      fetchStaffRecords();
    }
  }, [user.id]);

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

    const submissionDate = result.date || new Date().toLocaleDateString('en-CA');
    const alreadyUploaded = records.some(r => r.staff_id === user.id && r.date === submissionDate);
    if (alreadyUploaded) {
      alert(`You have already uploaded a screenshot for today (${submissionDate}). Only one screenshot per day is allowed.`);
      return;
    }

    setLoading(true);
    try {
      // Check in cloud database to prevent duplicate submissions on the same date
      const { data: existingCloud } = await supabase
        .from('step_records')
        .select('id')
        .eq('staff_id', user.id)
        .eq('date', submissionDate);

      if (existingCloud && existingCloud.length > 0) {
        alert(`You have already submitted your step count for today (${submissionDate}). Only one submission per day is permitted.`);
        setLoading(false);
        return;
      }

      const newRecord = {
        staff_id: user.id,
        name: user.name,
        dept: user.dept,
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
        setRecords(prev => [data[0], ...prev]);
        setFile(null);
        setResult(null);
        alert("Report submitted successfully! Your step count has been logged for today.");
      }
    } catch (err) {
      console.error("Supabase Error:", err.message);
      // Fallback local persistence if cloud has temporary network issue
      const localRec = {
        id: `local-${Date.now()}`,
        staff_id: user.id,
        name: user.name,
        dept: user.dept,
        steps: stepsNum,
        date: result.date,
        time: result.time,
        uploaded_time: result.uploadedTime,
        reason: (stepsNum < 5000 && !reason.trim()) ? 'Steps below daily target (< 5000)' : reason,
      };
      setRecords(prev => [localRec, ...prev]);
      setFile(null);
      setResult(null);
      alert("Submission saved successfully! (Note: Saved locally and will sync to cloud).");
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
  const todayRecord = records.find(r => r.staff_id === user.id && r.date === today);
  const hasUploadedToday = Boolean(todayRecord);

  const staffHistory = records.filter(r => r.staff_id === user.id).sort((a, b) => new Date(b.date) - new Date(a.date));
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
              <CheckCircle2 size={44} color="var(--success)" style={{ margin: '0 auto 1rem' }} />
              <h3 style={{ color: 'var(--success)', marginBottom: '0.5rem' }}>Today's Submission Complete</h3>
              <div style={{ margin: '1rem 0', padding: '1rem', background: 'white', borderRadius: '12px', border: '1px solid #bbf7d0' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block' }}>Your Recorded Step Count:</span>
                <span style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--primary)' }}>
                  {todayRecord?.steps?.toLocaleString()} Steps
                </span>
                <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px' }}>
                  📅 {todayRecord?.date} at {todayRecord?.uploaded_time || todayRecord?.time}
                </div>
                {todayRecord?.reason && (
                  <div style={{ fontSize: '0.8rem', color: '#b45309', marginTop: '6px' }}>
                    Note: {todayRecord.reason}
                  </div>
                )}
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                🔒 Strict Policy: Only <b>one screenshot per day</b> is permitted.
              </p>
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

              <button 
                onClick={handleFinalSubmit} 
                disabled={loading} 
                className="btn-primary" 
                style={{ width: '100%' }}
              >
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
            {loadingRecords ? (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', padding: '2rem', color: 'var(--text-muted)' }}>
                <Loader2 className="animate-spin" size={18} />
                <span>Loading activity history...</span>
              </div>
            ) : monthlyRecords.length === 0 ? (
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

const AdminDashboard = () => {
  const [records, setRecords] = useState([]);
  const [all90DayRecords, setAll90DayRecords] = useState([]);
  const [duplicateAlerts, setDuplicateAlerts] = useState([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const latestPastDate = pastRecords && pastRecords.length > 0
    ? pastRecords[pastRecords.length - 1].date
    : new Date().toLocaleDateString('en-CA');
  const [selectedDate, setSelectedDate] = useState(latestPastDate);
  const [filterDept, setFilterDept] = useState('All');
  const [sortOrder, setSortOrder] = useState('time');
  const [filterDuplicatesOnly, setFilterDuplicatesOnly] = useState(false);

  useEffect(() => {
    const fetchAdminRecords = async () => {
      setLoadingRecords(true);
      try {
        // Calculate 90 days ago cutoff date string
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        const cutoffStr = ninetyDaysAgo.toISOString().substring(0, 10);

        const { data, error } = await supabase
          .from('step_records')
          .select('*')
          .gte('date', cutoffStr);
          
        // Combine past records with any cloud records
        const recordMap = new Map();
        pastRecords.forEach(r => recordMap.set(`${r.date}_${r.staff_id}`, r));
        (data || []).forEach(r => recordMap.set(`${r.date}_${r.staff_id}`, r));
        const allFetched = Array.from(recordMap.values()).map(r => {
          const staff = mockStaffMembers.find(s => s.id === r.staff_id);
          return {
            ...r,
            staff_id: r.staff_id,
            name: r.name || staff?.name || r.staff_id,
            dept: r.dept || staff?.dept || 'General'
          };
        });
        setAll90DayRecords(allFetched);

        // Detect 90-day duplicate screenshot / step count alerts across all staff
        const alerts = findDuplicateAlertsInPeriod(allFetched, 90);
        setDuplicateAlerts(alerts);

        // Filter records for current selected date view
        setRecords(allFetched.filter(r => r.date === selectedDate));
      } catch (err) {
        console.warn("Admin fetch fallback to past records:", err);
        const recordMap = new Map();
        pastRecords.forEach(r => recordMap.set(`${r.date}_${r.staff_id}`, r));
        const allFetched = Array.from(recordMap.values()).map(r => {
          const staff = mockStaffMembers.find(s => s.id === r.staff_id);
          return {
            ...r,
            staff_id: r.staff_id,
            name: r.name || staff?.name || r.staff_id,
            dept: r.dept || staff?.dept || 'General'
          };
        });
        setAll90DayRecords(allFetched);
        setDuplicateAlerts(findDuplicateAlertsInPeriod(allFetched, 90));
        setRecords(allFetched.filter(r => r.date === selectedDate));
      } finally {
        setLoadingRecords(false);
      }
    };
    fetchAdminRecords();
  }, [selectedDate]);

  const filteredRecords = records;
  const totalStaff = mockStaffMembers.length;
  const completedToday = new Set(filteredRecords.filter(r => r.steps >= 5000 || r.reason).map(r => r.staff_id)).size;

  const departments = ['All', ...new Set(mockStaffMembers.map(s => s.dept))];

  // Set of staff IDs that have uploaded repeated step counts in the 90-day window (same staff repeats)
  const duplicateStaffIds = new Set(duplicateAlerts.map(a => a.staffId || a.staff_id));

  // Set of staff IDs that have a repeated step count specifically on the currently selected date
  const selectedDateDuplicateStaffIds = new Set(
    filteredRecords
      .filter(r => duplicateAlerts.some(a => a.steps === r.steps && (a.staffId === r.staff_id || a.staff_id === r.staff_id)))
      .map(r => r.staff_id)
  );

  let displayStaff = mockStaffMembers.filter(s => {
    if (filterDept !== 'All' && s.dept !== filterDept) return false;
    if (filterDuplicatesOnly) {
      return selectedDateDuplicateStaffIds.has(s.id) || duplicateStaffIds.has(s.id);
    }
    return true;
  });

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
      setAll90DayRecords(prev => prev.filter(r => r.id !== id));
      // Refresh duplicate alerts
      setDuplicateAlerts(prev => prev.filter(a => a.firstUploaded.id !== id && a.lastUploaded.id !== id));
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
      <div className="admin-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
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
        <div 
          onClick={() => setFilterDuplicatesOnly(prev => !prev)}
          className="glass-card" 
          style={{ 
            textAlign: 'center', 
            border: duplicateAlerts.length > 0 ? (filterDuplicatesOnly ? '2px solid #ea580c' : '1px solid #fed7aa') : 'var(--glass-border)', 
            background: filterDuplicatesOnly ? '#ffedd5' : (duplicateAlerts.length > 0 ? '#fff7ed' : 'white'),
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
          title="Click to filter table to only show staff with repeated values"
        >
          <h4 style={{ color: duplicateAlerts.length > 0 ? '#c2410c' : 'var(--text-muted)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <Bell size={16} /> 90-Day Duplicate Alerts
          </h4>
          <h1 style={{ color: duplicateAlerts.length > 0 ? '#ea580c' : 'var(--text-muted)' }}>{duplicateAlerts.length}</h1>
          <span style={{ fontSize: '0.72rem', color: '#9a3412', fontWeight: 600, display: 'block', marginTop: '4px' }}>
            {filterDuplicatesOnly ? '✓ Filter Active: Showing Repeated IDs' : '(Click to show repeated staff only)'}
          </span>
        </div>
      </div>

      {/* 90-Day Duplicate Step Count Alert Notification Panel */}
      {duplicateAlerts.length > 0 && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="glass-card" style={{ marginBottom: '2rem', background: '#fff7ed', border: '1px solid #ffedd5', padding: '1.5rem', borderRadius: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ background: '#ea580c', padding: '8px', borderRadius: '10px', color: 'white', display: 'flex' }}>
                <ShieldAlert size={22} />
              </div>
              <div>
                <h3 style={{ margin: 0, color: '#9a3412', fontSize: '1.2rem' }}>90-Day Duplicate Step Count Notifications</h3>
                <p style={{ margin: 0, color: '#c2410c', fontSize: '0.85rem' }}>Automated alerts identifying staff Person IDs who uploaded identical repeated step counts</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                onClick={() => setFilterDuplicatesOnly(prev => !prev)}
                style={{
                  background: filterDuplicatesOnly ? '#ea580c' : 'white',
                  color: filterDuplicatesOnly ? 'white' : '#ea580c',
                  border: '1px solid #ea580c',
                  padding: '4px 12px',
                  borderRadius: '20px',
                  fontSize: '0.8rem',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                {filterDuplicatesOnly ? 'Showing Repeated Uploaders Only' : 'Filter Table to These IDs'}
              </button>
              <span style={{ background: '#ea580c', color: 'white', fontWeight: 'bold', padding: '4px 12px', borderRadius: '20px', fontSize: '0.8rem' }}>
                {duplicateAlerts.length} Flagged {duplicateAlerts.length === 1 ? 'Anomaly' : 'Anomalies'}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {duplicateAlerts.map(alert => (
              <div key={alert.id} style={{ background: 'white', borderLeft: '5px solid #ea580c', borderRadius: '12px', padding: '1rem 1.2rem', boxShadow: '0 2px 5px rgba(0,0,0,0.04)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.8rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <span style={{ fontSize: '1.15rem', fontWeight: 'bold', color: '#ea580c' }}>
                      {alert.steps.toLocaleString()} Steps
                    </span>
                    <span style={{ fontSize: '0.75rem', padding: '3px 8px', borderRadius: '12px', background: '#eff6ff', color: '#1d4ed8', fontWeight: 'bold' }}>
                      🔄 Same Staff Re-Upload
                    </span>
                    <span style={{ fontSize: '0.8rem', padding: '3px 10px', borderRadius: '8px', background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <User size={13} /> Person ID: <b style={{ fontFamily: 'monospace' }}>{alert.staffId}</b>
                    </span>
                    <span style={{ fontSize: '0.85rem', color: '#1e293b', fontWeight: 600 }}>
                      {alert.name} ({alert.dept})
                    </span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={14} /> Gap: <b>{alert.daysDifference} days apart</b>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', background: '#f8fafc', padding: '0.8rem 1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase' }}>First Submission:</span>
                      <span style={{ background: '#dbeafe', color: '#1e40af', border: '1px solid #bfdbfe', padding: '1px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 'bold', fontFamily: 'monospace' }}>
                        Person ID: {alert.staffId}
                      </span>
                    </div>
                    <div style={{ fontWeight: 600, color: '#1e293b' }}>{alert.firstUploaded.name} ({alert.firstUploaded.dept})</div>
                    <div style={{ fontSize: '0.85rem', color: '#059669', fontWeight: 500, marginTop: '3px' }}>📅 {alert.firstUploaded.timestampStr}</div>
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase' }}>Repeated Submission:</span>
                      <span style={{ background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca', padding: '1px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 'bold', fontFamily: 'monospace' }}>
                        Person ID: {alert.staffId}
                      </span>
                    </div>
                    <div style={{ fontWeight: 600, color: '#1e293b' }}>{alert.lastUploaded.name} ({alert.lastUploaded.dept})</div>
                    <div style={{ fontSize: '0.85rem', color: '#dc2626', fontWeight: 500, marginTop: '3px' }}>📅 {alert.lastUploaded.timestampStr}</div>
                  </div>
                </div>

                {alert.allMatchedRecords && alert.allMatchedRecords.length > 2 && (
                  <div style={{ marginTop: '0.75rem', paddingTop: '0.5rem', borderTop: '1px dashed #e2e8f0', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px', fontSize: '0.78rem' }}>
                    <span style={{ color: '#64748b', fontWeight: 600 }}>All upload dates for Person ID <b>{alert.staffId}</b> with this value:</span>
                    {alert.allMatchedRecords.map((m, idx) => (
                      <span key={idx} style={{ background: '#f1f5f9', color: '#1e293b', border: '1px solid #cbd5e1', padding: '2px 8px', borderRadius: '6px', fontWeight: 500 }}>
                        {m.date} ({m.time})
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </motion.div>
      )}

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
              onClick={() => setFilterDuplicatesOnly(prev => !prev)}
              style={{
                padding: '0.5rem 1rem',
                height: '38px',
                borderRadius: '8px',
                fontSize: '0.82rem',
                fontWeight: 'bold',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: filterDuplicatesOnly ? '#ea580c' : '#fff7ed',
                color: filterDuplicatesOnly ? 'white' : '#c2410c',
                border: '1px solid #fed7aa',
                boxShadow: filterDuplicatesOnly ? '0 2px 8px rgba(234,88,12,0.3)' : 'none',
                transition: 'all 0.2s ease'
              }}
              title="Show only staff who uploaded repeated step counts"
            >
              <ShieldAlert size={16} />
              {filterDuplicatesOnly ? 'Show All Staff' : `Only Repeated Uploads (${duplicateStaffIds.size})`}
            </button>

            <button
              onClick={() => exportToExcelFull(exportRecords, `Daily Report - ${selectedDate}`, null, mockStaffMembers)}
              className="btn-primary" style={{ padding: '0.5rem 1rem', height: '38px' }}
            >
              <FileSpreadsheet size={18} /> Export Filtered
            </button>

            <button
              onClick={() => exportPendingListExcel(selectedDate, mockStaffMembers, records)}
              className="btn-primary" style={{ padding: '0.5rem 1rem', height: '38px', background: '#dc2626', color: 'white', border: '1px solid #b91c1c' }}
              title="Download Excel list of staff who have not submitted screenshot"
            >
              <AlertCircle size={18} /> Export Pending List
            </button>
          </div>
        </div>

        {filterDuplicatesOnly && (
          <div style={{ background: '#ffedd5', border: '1px solid #fed7aa', borderRadius: '10px', padding: '0.8rem 1.2rem', marginBottom: '1.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#9a3412' }}>
              <ShieldAlert size={18} />
              <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                Showing only staff Person IDs who uploaded repeated step count values ({displayStaff.length} staff found).
              </span>
            </div>
            <button 
              onClick={() => setFilterDuplicatesOnly(false)} 
              style={{ background: 'white', border: '1px solid #fdba74', color: '#c2410c', padding: '4px 12px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 'bold', cursor: 'pointer' }}
            >
              Show All Staff
            </button>
          </div>
        )}

        <div className="table-wrapper">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--glass-border)', textAlign: 'left', color: 'var(--text-muted)' }}>
              <th style={{ padding: '1rem' }}>Staff Name & Person ID</th>
              <th>Department</th>
              <th>Steps</th>
              <th>Reason</th>
              <th>Uploaded Time</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loadingRecords ? (
              <tr>
                <td colSpan="7" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
                    <Loader2 className="animate-spin" size={18} />
                    <span>Fetching records from cloud...</span>
                  </div>
                </td>
              </tr>
            ) : displayStaff.length === 0 ? (
              <tr>
                <td colSpan="7" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  {filterDuplicatesOnly ? 'No repeated step count uploads found matching current filters.' : 'No staff members found.'}
                </td>
              </tr>
            ) : (
              displayStaff.map(staff => {
                const record = filteredRecords.find(r => r.staff_id === staff.id);
                // Check if this record is a repeated step count by the SAME staff member
                const matchingAlert = record 
                  ? duplicateAlerts.find(a => a.steps === record.steps && (a.staffId === staff.id || a.staff_id === staff.id)) 
                  : null;
                
                return (
                  <tr key={staff.id} style={{ borderBottom: '1px solid var(--glass-border)', background: matchingAlert ? '#fffaf5' : undefined }}>
                    <td style={{ padding: '1rem', borderLeft: matchingAlert ? '4px solid #ea580c' : undefined }}>
                      <div style={{ fontWeight: 600, color: matchingAlert ? '#9a3412' : 'inherit' }}>{staff.name}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
                        <span style={{ 
                          fontSize: '0.78rem', 
                          fontWeight: matchingAlert ? 'bold' : 'normal',
                          background: matchingAlert ? '#fed7aa' : '#f1f5f9',
                          color: matchingAlert ? '#7c2d12' : 'var(--text-muted)',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          fontFamily: 'monospace',
                          border: matchingAlert ? '1px solid #fdba74' : 'none'
                        }}>
                          Person ID: {staff.id}
                        </span>
                        {matchingAlert && (
                          <span style={{ fontSize: '0.68rem', background: '#fee2e2', color: '#991b1b', padding: '1px 5px', borderRadius: '4px', fontWeight: 'bold' }}>
                            Repeated Value
                          </span>
                        )}
                      </div>
                    </td>
                    <td>{staff.dept}</td>
                    <td style={{ fontWeight: 'bold', color: (record?.steps >= 5000 || record?.reason) ? '#16a34a' : (record ? '#dc2626' : 'inherit') }}>
                      {record ? (
                        <div>
                          <div style={{ fontSize: '1.05rem' }}>{record.steps.toLocaleString()}</div>
                          {matchingAlert && (
                            <div style={{ marginTop: '4px' }}>
                              <div style={{
                                background: '#fff7ed',
                                border: '1px solid #fed7aa',
                                borderRadius: '8px',
                                padding: '4px 8px',
                                display: 'inline-flex',
                                flexDirection: 'column',
                                gap: '3px',
                                boxShadow: '0 1px 2px rgba(234,88,12,0.1)'
                              }}>
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#c2410c', fontSize: '0.72rem', fontWeight: 'bold' }}>
                                  <AlertTriangle size={12} color="#ea580c" />
                                  <span>Repeated Value (Same Staff)</span>
                                </div>
                                <div style={{ fontSize: '0.72rem', color: '#9a3412', fontWeight: 600 }}>
                                  Person ID: <span style={{ fontFamily: 'monospace', background: '#ffedd5', color: '#7c2d12', padding: '1px 6px', borderRadius: '4px', fontWeight: 'bold', border: '1px solid #fed7aa' }}>{staff.id}</span>
                                </div>
                                <div style={{ fontSize: '0.68rem', color: '#64748b' }}>
                                  Previously submitted on {matchingAlert.firstUploaded.date} ({matchingAlert.daysDifference} days apart)
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : '---'}
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
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  </div>
);
};

// --- Main App ---

function App() {
  // Persistent login: Initialize directly from localStorage to eliminate any login screen flicker on PWA or web reopen
  const [user, setUser] = useState(() => {
    try {
      const savedUser = localStorage.getItem('step_user');
      return savedUser ? JSON.parse(savedUser) : null;
    } catch (e) {
      return null;
    }
  });

  const [deferredPrompt, setDeferredPrompt] = useState(null);

  useEffect(() => {
    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  const handleInstallApp = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

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
      <Navbar 
        user={user} 
        onLogout={handleLogout} 
        installPrompt={deferredPrompt} 
        onInstall={handleInstallApp} 
      />

      <main style={{ padding: '2rem 0' }}>
        <AnimatePresence mode="wait">
          {!user ? (
            <Login key="login" onLogin={handleLogin} />
          ) : user.role === 'admin' ? (
            <AdminDashboard key="admin" />
          ) : (
            <StaffDashboard key="staff" user={user} />
          )}
        </AnimatePresence>
      </main>

      <footer style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
        &copy; 2026 Staff Fit Monitoring System • Faculty Wellness Initiative
      </footer>
    </div>
  );
}

export default App;
