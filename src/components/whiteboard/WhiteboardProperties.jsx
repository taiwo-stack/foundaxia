import React from 'react';
import { ChevronLeft, Moon, Sun, Trash, ChevronRight } from 'lucide-react';
import { PRESET_COLORS } from './constants';

export default function WhiteboardProperties({
  isPropertiesCollapsed,
  setIsPropertiesCollapsed,
  isCollaborating,
  hasDrawAccess,
  isHost,
  activeColor,
  setActiveColor,
  strokeWidth,
  setStrokeWidth,
  fontSize,
  setFontSize,
  activeTool,
  fillMode,
  setFillMode,
  gridType,
  setGridType,
  snapToGrid,
  setSnapToGrid,
  isPressureSensitive,
  setIsPressureSensitive,
  theme,
  setTheme,
  selectedElement,
  setSelectedElement,
  elements,
  pushToHistory,
  broadcastElementsUpdate
}) {
  // If user is collaborator and does not have drawing access, properties shouldn't render
  if (!isHost && isCollaborating && !hasDrawAccess) return null;

  if (isPropertiesCollapsed) {
    return (
      <button 
        className="whiteboard-floating-trigger properties-trigger"
        onClick={() => setIsPropertiesCollapsed(false)}
        data-tooltip="Expand Options"
      >
        <ChevronLeft size={20} />
      </button>
    );
  }

  return (
    <div className="whiteboard-properties">
      <div className="properties-panel-header" style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '10px', marginBottom: '10px' }}>
        <span className="prop-title" style={{ margin: 0 }}>Properties</span>
      </div>

      {/* Scrollable Settings Content */}
      <div className="properties-panel-content">
        {/* Colors Selection */}
        <div className="prop-section">
          <span className="prop-title">Pen & Ink Palette</span>
          <div className="color-palette">
            {PRESET_COLORS.map(color => (
              <button 
                key={color}
                className={`color-swatch ${activeColor.toLowerCase() === color.toLowerCase() ? 'active' : ''}`}
                style={{ backgroundColor: color }}
                onClick={() => setActiveColor(color)}
              />
            ))}
          </div>
          
          <div className="custom-color-input-wrapper">
            <input 
              type="color" 
              className="custom-color-picker"
              value={activeColor}
              onChange={(e) => setActiveColor(e.target.value)}
            />
            <input 
              type="text" 
              className="custom-color-hex"
              value={activeColor.toUpperCase()}
              onChange={(e) => setActiveColor(e.target.value)}
            />
          </div>
        </div>

        {/* Width / Size Settings */}
        <div className="prop-section">
          <span className="prop-title">Line / Text Size</span>
          <div className="brush-sizes">
            {[2, 4, 8, 16].map(size => (
              <button 
                key={size}
                className={`brush-size-btn ${strokeWidth === size ? 'active' : ''}`}
                onClick={() => {
                  setStrokeWidth(size);
                  setFontSize(size + 16); // Sync font size logically
                }}
              >
                {size}px
              </button>
            ))}
          </div>
          <input 
            type="range" 
            min="1" 
            max="50" 
            className="brush-width-slider"
            value={strokeWidth}
            onChange={(e) => {
              const val = parseInt(e.target.value);
              setStrokeWidth(val);
              setFontSize(val + 16);
            }}
          />
        </div>

        {/* Shape Fill Modes */}
        {['rectangle', 'circle'].includes(activeTool) && (
          <div className="prop-section">
            <span className="prop-title">Shape Fill mode</span>
            <div className="fill-modes">
              {['none', 'semi', 'solid'].map(mode => (
                <button
                  key={mode}
                  className={`fill-mode-btn ${fillMode === mode ? 'active' : ''}`}
                  onClick={() => setFillMode(mode)}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Backdrop/Grid Selector */}
        <div className="prop-section">
          <span className="prop-title">Backdrop Canvas Grid</span>
          <div className="backdrop-grid">
            {['blank', 'dots', 'lines', 'graph'].map(type => (
              <button
                key={type}
                className={`backdrop-btn ${gridType === type ? 'active' : ''}`}
                onClick={() => setGridType(type)}
              >
                {type === 'lines' ? 'Notebook' : type === 'graph' ? 'Math Grid' : type}
              </button>
            ))}
          </div>
        </div>

        {/* Advanced Canvas Settings */}
        <div className="prop-section">
          <span className="prop-title">Canvas Options</span>
          <div className="canvas-settings-list">
            <label className="canvas-setting-item">
              <input 
                type="checkbox" 
                checked={snapToGrid} 
                onChange={(e) => setSnapToGrid(e.target.checked)} 
                className="canvas-setting-checkbox"
              />
              <span className="setting-label-text">Snap to Grid (24px)</span>
            </label>
            <label className="canvas-setting-item">
              <input 
                type="checkbox" 
                checked={isPressureSensitive} 
                onChange={(e) => setIsPressureSensitive(e.target.checked)} 
                className="canvas-setting-checkbox"
              />
              <span className="setting-label-text">Pressure Sensitive</span>
            </label>
          </div>
        </div>

        {/* Theme Color Picker */}
        <div className="prop-section">
          <span className="prop-title">Board Theme</span>
          <div className="theme-toggle-container">
            <button 
              className={`theme-btn ${theme === 'dark' ? 'active' : ''}`}
              onClick={() => setTheme('dark')}
            >
              <Moon size={14} />
              <span>Blackboard</span>
            </button>
            <button 
              className={`theme-btn ${theme === 'light' ? 'active' : ''}`}
              onClick={() => setTheme('light')}
            >
              <Sun size={14} />
              <span>Whiteboard</span>
            </button>
          </div>
        </div>

        {/* Delete Element option in properties panel when selected */}
        {selectedElement && (
          <div className="prop-section" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '15px' }}>
            <span className="prop-title">Manage Selected Element</span>
            <button
              className="whiteboard-btn danger"
              style={{ width: '100%', justifyContent: 'center', marginTop: '5px' }}
              onClick={() => {
                const remaining = elements.filter(el => el.id !== selectedElement.id);
                pushToHistory(remaining);
                setSelectedElement(null);
                broadcastElementsUpdate?.(remaining);
              }}
            >
              <Trash size={16} />
              <span>Delete Element</span>
            </button>
          </div>
        )}
      </div>

      {/* Non-scrollable Fixed Footer for collapse button */}
      <div className="properties-panel-footer">
        <button
          className="whiteboard-btn-icon"
          style={{ background: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.25)', color: '#f87171', width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setIsPropertiesCollapsed(true)}
          title="Collapse Options"
        >
          <ChevronRight size={20} />
        </button>
      </div>
    </div>
  );
}
