#!/usr/bin/env node
/**
 * ClaudeGUI Investor Pitch Deck Generator
 * Creates a professional 5-slide presentation for financial sector investors
 *
 * Design Specifications:
 * - Primary: Forest Green (#065F46)
 * - Accent: Gold (#CA8A04)
 * - Background: White/Light Sage
 * - Font: Clean sans-serif styling
 * - Layout: Z-pattern, 60/40 visual-to-text ratio
 */

import PptxGenJS from 'pptxgenjs';

// Color Palette
const COLORS = {
  primary: '065F46',      // Forest Green
  accent: 'CA8A04',       // Gold
  white: 'FFFFFF',
  lightSage: 'F0FDF4',
  darkText: '1F2937',
  lightText: '6B7280',
  success: '10B981',
  gradientDark: '064E3B',
};

// Font Settings
const FONTS = {
  heading: 'Arial',
  body: 'Arial',
};

function createPresentation() {
  const pptx = new PptxGenJS();

  // Presentation metadata
  pptx.author = 'ClaudeGUI Team';
  pptx.title = 'ClaudeGUI - Investment Proposal';
  pptx.subject = 'AI-Powered Development IDE Investment Pitch';
  pptx.company = 'ClaudeGUI';
  pptx.layout = 'LAYOUT_16x9';

  // Define master slides
  pptx.defineSlideMaster({
    title: 'TITLE_SLIDE',
    background: { color: COLORS.primary },
  });

  pptx.defineSlideMaster({
    title: 'CONTENT_SLIDE',
    background: { color: COLORS.white },
  });

  // ============================================================
  // SLIDE 1: Title Slide - "The Future of AI-Assisted Development"
  // ============================================================
  const slide1 = pptx.addSlide({ masterName: 'TITLE_SLIDE' });

  // Gradient overlay effect (simulated with shapes)
  slide1.addShape(pptx.shapes.RECTANGLE, {
    x: 0, y: 0, w: '100%', h: '100%',
    fill: { type: 'solid', color: COLORS.primary },
  });

  // Decorative accent line
  slide1.addShape(pptx.shapes.RECTANGLE, {
    x: 0.5, y: 2.8, w: 1.5, h: 0.08,
    fill: { color: COLORS.accent },
  });

  // Main Title
  slide1.addText('ClaudeGUI', {
    x: 0.5, y: 1.5, w: 9, h: 1.2,
    fontSize: 54,
    fontFace: FONTS.heading,
    color: COLORS.white,
    bold: true,
  });

  // Subtitle
  slide1.addText('Next-Generation AI-Powered\nDevelopment IDE', {
    x: 0.5, y: 3.0, w: 6, h: 1.2,
    fontSize: 28,
    fontFace: FONTS.body,
    color: COLORS.lightSage,
    lineSpacing: 36,
  });

  // Tagline
  slide1.addText('Transforming How Developers Build with AI', {
    x: 0.5, y: 4.5, w: 8, h: 0.5,
    fontSize: 18,
    fontFace: FONTS.body,
    color: COLORS.accent,
    italic: true,
  });

  // Investment badge
  slide1.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 8.5, y: 4.3, w: 1.3, h: 0.5,
    fill: { color: COLORS.accent },
    rectRadius: 0.1,
  });
  slide1.addText('SERIES A', {
    x: 8.5, y: 4.35, w: 1.3, h: 0.4,
    fontSize: 11,
    fontFace: FONTS.heading,
    color: COLORS.primary,
    bold: true,
    align: 'center',
    valign: 'middle',
  });

  // ============================================================
  // SLIDE 2: Problem & Solution - "Developers Deserve Better Tools"
  // ============================================================
  const slide2 = pptx.addSlide({ masterName: 'CONTENT_SLIDE' });

  // Header bar
  slide2.addShape(pptx.shapes.RECTANGLE, {
    x: 0, y: 0, w: '100%', h: 0.6,
    fill: { color: COLORS.primary },
  });

  // Action Title
  slide2.addText('AI Development Tools Are Transforming the Industry', {
    x: 0.5, y: 0.12, w: 9, h: 0.4,
    fontSize: 18,
    fontFace: FONTS.heading,
    color: COLORS.white,
    bold: true,
  });

  // Left Column - Problem
  slide2.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 0.4, y: 0.9, w: 4.5, h: 4.0,
    fill: { color: 'FEF2F2' },
    rectRadius: 0.15,
    line: { color: 'FCA5A5', width: 1 },
  });

  slide2.addText('THE CHALLENGE', {
    x: 0.6, y: 1.1, w: 4, h: 0.35,
    fontSize: 12,
    fontFace: FONTS.heading,
    color: 'DC2626',
    bold: true,
  });

  slide2.addText('Current AI coding tools lack seamless integration', {
    x: 0.6, y: 1.5, w: 4.1, h: 0.7,
    fontSize: 16,
    fontFace: FONTS.heading,
    color: COLORS.darkText,
    bold: true,
  });

  // Problem points with icons (represented as shapes)
  const problems = [
    { icon: '⚡', text: 'Context switching between terminals' },
    { icon: '🔄', text: 'Manual file synchronization' },
    { icon: '⏱️', text: '40% time lost on tool management' },
  ];

  problems.forEach((p, i) => {
    slide2.addText(`${p.icon}  ${p.text}`, {
      x: 0.6, y: 2.4 + (i * 0.55), w: 4.1, h: 0.5,
      fontSize: 13,
      fontFace: FONTS.body,
      color: COLORS.darkText,
    });
  });

  // Right Column - Solution
  slide2.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 5.1, y: 0.9, w: 4.5, h: 4.0,
    fill: { color: COLORS.lightSage },
    rectRadius: 0.15,
    line: { color: COLORS.success, width: 1 },
  });

  slide2.addText('OUR SOLUTION', {
    x: 5.3, y: 1.1, w: 4, h: 0.35,
    fontSize: 12,
    fontFace: FONTS.heading,
    color: COLORS.primary,
    bold: true,
  });

  slide2.addText('Unified AI-Native IDE Experience', {
    x: 5.3, y: 1.5, w: 4.1, h: 0.7,
    fontSize: 16,
    fontFace: FONTS.heading,
    color: COLORS.darkText,
    bold: true,
  });

  const solutions = [
    { icon: '🎯', text: '4-panel integrated workspace' },
    { icon: '🔗', text: 'Real-time Claude AI streaming' },
    { icon: '📁', text: 'Native file system integration' },
  ];

  solutions.forEach((s, i) => {
    slide2.addText(`${s.icon}  ${s.text}`, {
      x: 5.3, y: 2.4 + (i * 0.55), w: 4.1, h: 0.5,
      fontSize: 13,
      fontFace: FONTS.body,
      color: COLORS.darkText,
    });
  });

  // Arrow between columns
  slide2.addText('→', {
    x: 4.6, y: 2.5, w: 0.5, h: 0.5,
    fontSize: 28,
    fontFace: FONTS.heading,
    color: COLORS.accent,
    align: 'center',
  });

  // ============================================================
  // SLIDE 3: Technology Stack - "Enterprise-Grade Architecture"
  // ============================================================
  const slide3 = pptx.addSlide({ masterName: 'CONTENT_SLIDE' });

  // Header bar
  slide3.addShape(pptx.shapes.RECTANGLE, {
    x: 0, y: 0, w: '100%', h: 0.6,
    fill: { color: COLORS.primary },
  });

  slide3.addText('Enterprise-Grade Technology Powering Innovation', {
    x: 0.5, y: 0.12, w: 9, h: 0.4,
    fontSize: 18,
    fontFace: FONTS.heading,
    color: COLORS.white,
    bold: true,
  });

  // Architecture diagram - 4 Panel Layout
  const panels = [
    { name: 'File Explorer', tech: 'react-arborist', x: 0.4, color: '3B82F6' },
    { name: 'Code Editor', tech: 'Monaco Editor', x: 2.65, color: 'F59E0B' },
    { name: 'AI Terminal', tech: 'xterm.js + pty', x: 4.9, color: '8B5CF6' },
    { name: 'Preview', tech: 'Multi-format', x: 7.15, color: '10B981' },
  ];

  panels.forEach((panel) => {
    // Panel box
    slide3.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: panel.x, y: 0.9, w: 2.1, h: 1.4,
      fill: { color: COLORS.white },
      rectRadius: 0.1,
      line: { color: panel.color, width: 2 },
      shadow: { type: 'outer', blur: 4, offset: 2, angle: 45, opacity: 0.2 },
    });

    // Panel header
    slide3.addShape(pptx.shapes.RECTANGLE, {
      x: panel.x, y: 0.9, w: 2.1, h: 0.35,
      fill: { color: panel.color },
    });

    slide3.addText(panel.name, {
      x: panel.x, y: 0.92, w: 2.1, h: 0.3,
      fontSize: 10,
      fontFace: FONTS.heading,
      color: COLORS.white,
      bold: true,
      align: 'center',
    });

    slide3.addText(panel.tech, {
      x: panel.x, y: 1.4, w: 2.1, h: 0.6,
      fontSize: 11,
      fontFace: FONTS.body,
      color: COLORS.darkText,
      align: 'center',
      valign: 'middle',
    });
  });

  // Core Technologies section
  slide3.addText('CORE STACK', {
    x: 0.4, y: 2.55, w: 2, h: 0.3,
    fontSize: 11,
    fontFace: FONTS.heading,
    color: COLORS.primary,
    bold: true,
  });

  const techStack = [
    ['Next.js 14+', 'App Router'],
    ['TypeScript', 'Strict Mode'],
    ['WebSocket', 'Real-time'],
    ['Zustand', 'State Mgmt'],
  ];

  techStack.forEach((tech, i) => {
    const xPos = 0.4 + (i * 2.35);
    slide3.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: xPos, y: 2.9, w: 2.2, h: 0.9,
      fill: { color: COLORS.lightSage },
      rectRadius: 0.08,
    });
    slide3.addText(tech[0], {
      x: xPos, y: 2.95, w: 2.2, h: 0.45,
      fontSize: 13,
      fontFace: FONTS.heading,
      color: COLORS.primary,
      bold: true,
      align: 'center',
    });
    slide3.addText(tech[1], {
      x: xPos, y: 3.35, w: 2.2, h: 0.35,
      fontSize: 10,
      fontFace: FONTS.body,
      color: COLORS.lightText,
      align: 'center',
    });
  });

  // Security badge
  slide3.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 0.4, y: 4.1, w: 9.2, h: 0.75,
    fill: { color: COLORS.primary },
    rectRadius: 0.1,
  });

  slide3.addText('🔒  Enterprise Security: Path validation • Sandbox isolation • Rate limiting • Native file watching', {
    x: 0.6, y: 4.2, w: 8.8, h: 0.55,
    fontSize: 12,
    fontFace: FONTS.body,
    color: COLORS.white,
    align: 'center',
    valign: 'middle',
  });

  // ============================================================
  // SLIDE 4: Market Opportunity - "The AI Dev Tools Market Is Exploding"
  // ============================================================
  const slide4 = pptx.addSlide({ masterName: 'CONTENT_SLIDE' });

  // Header bar
  slide4.addShape(pptx.shapes.RECTANGLE, {
    x: 0, y: 0, w: '100%', h: 0.6,
    fill: { color: COLORS.primary },
  });

  slide4.addText('The $50B AI Developer Tools Market Is Exploding', {
    x: 0.5, y: 0.12, w: 9, h: 0.4,
    fontSize: 18,
    fontFace: FONTS.heading,
    color: COLORS.white,
    bold: true,
  });

  // Market size visualization (bar chart simulation)
  slide4.addText('MARKET GROWTH PROJECTION', {
    x: 0.4, y: 0.85, w: 4, h: 0.3,
    fontSize: 11,
    fontFace: FONTS.heading,
    color: COLORS.lightText,
    bold: true,
  });

  // Chart bars
  const marketData = [
    { year: '2023', value: 15, height: 0.9 },
    { year: '2024', value: 22, height: 1.32 },
    { year: '2025', value: 32, height: 1.92 },
    { year: '2026', value: 50, height: 3.0 },
  ];

  marketData.forEach((d, i) => {
    const xPos = 0.8 + (i * 1.1);
    // Bar
    slide4.addShape(pptx.shapes.RECTANGLE, {
      x: xPos, y: 4.1 - d.height, w: 0.8, h: d.height,
      fill: { color: i === 3 ? COLORS.accent : COLORS.primary },
    });
    // Year label
    slide4.addText(d.year, {
      x: xPos, y: 4.2, w: 0.8, h: 0.3,
      fontSize: 10,
      fontFace: FONTS.body,
      color: COLORS.darkText,
      align: 'center',
    });
    // Value label
    slide4.addText(`$${d.value}B`, {
      x: xPos, y: 4.0 - d.height - 0.25, w: 0.8, h: 0.25,
      fontSize: 10,
      fontFace: FONTS.heading,
      color: COLORS.primary,
      bold: true,
      align: 'center',
    });
  });

  // CAGR indicator
  slide4.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 0.5, y: 4.55, w: 1.2, h: 0.35,
    fill: { color: COLORS.accent },
    rectRadius: 0.08,
  });
  slide4.addText('49% CAGR', {
    x: 0.5, y: 4.58, w: 1.2, h: 0.3,
    fontSize: 10,
    fontFace: FONTS.heading,
    color: COLORS.white,
    bold: true,
    align: 'center',
  });

  // Key metrics on the right
  slide4.addText('KEY DIFFERENTIATORS', {
    x: 5.3, y: 0.85, w: 4, h: 0.3,
    fontSize: 11,
    fontFace: FONTS.heading,
    color: COLORS.lightText,
    bold: true,
  });

  const metrics = [
    { number: '4-Panel', label: 'Professional IDE Layout', icon: '🖥️' },
    { number: 'Real-time', label: 'WebSocket Streaming', icon: '⚡' },
    { number: 'Native', label: 'Claude AI Integration', icon: '🤖' },
    { number: 'Zero', label: 'Configuration Setup', icon: '🎯' },
  ];

  metrics.forEach((m, i) => {
    const yPos = 1.25 + (i * 0.85);
    slide4.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: 5.3, y: yPos, w: 4.3, h: 0.75,
      fill: { color: COLORS.lightSage },
      rectRadius: 0.1,
    });
    slide4.addText(m.icon, {
      x: 5.5, y: yPos + 0.15, w: 0.5, h: 0.45,
      fontSize: 20,
      align: 'center',
    });
    slide4.addText(m.number, {
      x: 6.1, y: yPos + 0.08, w: 3.3, h: 0.35,
      fontSize: 14,
      fontFace: FONTS.heading,
      color: COLORS.primary,
      bold: true,
    });
    slide4.addText(m.label, {
      x: 6.1, y: yPos + 0.4, w: 3.3, h: 0.3,
      fontSize: 11,
      fontFace: FONTS.body,
      color: COLORS.lightText,
    });
  });

  // ============================================================
  // SLIDE 5: Investment Ask - "Join the AI Development Revolution"
  // ============================================================
  const slide5 = pptx.addSlide({ masterName: 'TITLE_SLIDE' });

  // Background
  slide5.addShape(pptx.shapes.RECTANGLE, {
    x: 0, y: 0, w: '100%', h: '100%',
    fill: { color: COLORS.primary },
  });

  // Decorative elements
  slide5.addShape(pptx.shapes.OVAL, {
    x: -1, y: -1, w: 3, h: 3,
    fill: { color: COLORS.gradientDark },
    line: { color: COLORS.gradientDark },
  });

  slide5.addShape(pptx.shapes.OVAL, {
    x: 8.5, y: 3.5, w: 2.5, h: 2.5,
    fill: { color: COLORS.gradientDark },
    line: { color: COLORS.gradientDark },
  });

  // Main heading
  slide5.addText('Join the AI Development\nRevolution', {
    x: 0.5, y: 0.8, w: 7, h: 1.4,
    fontSize: 38,
    fontFace: FONTS.heading,
    color: COLORS.white,
    bold: true,
    lineSpacing: 48,
  });

  // Investment details
  slide5.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 0.5, y: 2.5, w: 4.2, h: 2.0,
    fill: { color: COLORS.white },
    rectRadius: 0.15,
  });

  slide5.addText('INVESTMENT OPPORTUNITY', {
    x: 0.7, y: 2.65, w: 3.8, h: 0.3,
    fontSize: 10,
    fontFace: FONTS.heading,
    color: COLORS.primary,
    bold: true,
  });

  slide5.addText('Series A Round', {
    x: 0.7, y: 3.0, w: 3.8, h: 0.4,
    fontSize: 20,
    fontFace: FONTS.heading,
    color: COLORS.darkText,
    bold: true,
  });

  slide5.addText('• Enterprise IDE market entry\n• AI-native development tools\n• Global developer community', {
    x: 0.7, y: 3.45, w: 3.8, h: 0.9,
    fontSize: 11,
    fontFace: FONTS.body,
    color: COLORS.lightText,
    lineSpacing: 18,
  });

  // Use of funds
  slide5.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 5.0, y: 2.5, w: 4.5, h: 2.0,
    fill: { color: COLORS.accent },
    rectRadius: 0.15,
  });

  slide5.addText('USE OF FUNDS', {
    x: 5.2, y: 2.65, w: 4.1, h: 0.3,
    fontSize: 10,
    fontFace: FONTS.heading,
    color: COLORS.primary,
    bold: true,
  });

  const fundAllocation = [
    ['50%', 'Product Development'],
    ['30%', 'Go-to-Market'],
    ['20%', 'Operations'],
  ];

  fundAllocation.forEach((f, i) => {
    slide5.addText(`${f[0]}  ${f[1]}`, {
      x: 5.2, y: 3.05 + (i * 0.45), w: 4.1, h: 0.4,
      fontSize: 13,
      fontFace: FONTS.body,
      color: COLORS.primary,
    });
  });

  // Contact CTA
  slide5.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 3.2, y: 4.6, w: 3.6, h: 0.5,
    fill: { color: COLORS.white },
    rectRadius: 0.25,
  });

  slide5.addText("Let's Build Together →", {
    x: 3.2, y: 4.65, w: 3.6, h: 0.4,
    fontSize: 14,
    fontFace: FONTS.heading,
    color: COLORS.primary,
    bold: true,
    align: 'center',
  });

  return pptx;
}

async function main() {
  console.log('🎨 Generating ClaudeGUI Investor Pitch Deck...');
  console.log('');
  console.log('Design Specifications:');
  console.log('  • Primary Color: Forest Green (#065F46)');
  console.log('  • Accent Color: Gold (#CA8A04)');
  console.log('  • Layout: 16:9 Z-pattern');
  console.log('  • Slides: 5 professional slides');
  console.log('');

  const pptx = createPresentation();
  const filename = 'ClaudeGUI_Investor_Pitch.pptx';

  await pptx.writeFile({ fileName: filename });

  console.log(`✅ Presentation created: ${filename}`);
  console.log('');
  console.log('Slide Overview:');
  console.log('  1. Title: Next-Generation AI-Powered Development IDE');
  console.log('  2. Problem & Solution: AI Development Tools Are Transforming');
  console.log('  3. Technology: Enterprise-Grade Architecture');
  console.log('  4. Market: The $50B AI Dev Tools Market');
  console.log('  5. Investment Ask: Join the AI Development Revolution');
}

main().catch(console.error);
