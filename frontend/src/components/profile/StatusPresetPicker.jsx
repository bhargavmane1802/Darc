import React, { memo } from 'react';

const STATUS_PRESETS = [
  { emoji: '🟢', label: 'Available', text: '🟢 Available' },
  { emoji: '💻', label: 'In deep work', text: '💻 In deep work' },
  { emoji: '🚀', label: 'Shipping features', text: '🚀 Shipping features' },
  { emoji: '🎯', label: 'Focus mode', text: '🎯 Focus mode' },
  { emoji: '☕', label: 'Coffee break', text: '☕ Coffee break' },
  { emoji: '🔕', label: 'Do not disturb', text: '🔕 Do not disturb' },
];

function StatusPresetPickerComponent({ currentStatus, onSelectStatus }) {
  return (
    <div className="status-presets">
      <span className="status-presets__label">Quick Presets:</span>
      <div className="status-presets__list" role="group" aria-label="Status Presets">
        {STATUS_PRESETS.map((preset) => {
          const isSelected = currentStatus === preset.text;
          return (
            <button
              key={preset.text}
              type="button"
              className={`status-presets__chip ${isSelected ? 'status-presets__chip--active' : ''}`}
              onClick={() => onSelectStatus(preset.text)}
              title={`Set status to "${preset.label}"`}
            >
              <span className="status-presets__emoji">{preset.emoji}</span>
              <span className="status-presets__text">{preset.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export const StatusPresetPicker = memo(StatusPresetPickerComponent, (prev, next) => {
  return (
    prev.currentStatus === next.currentStatus &&
    prev.onSelectStatus === next.onSelectStatus
  );
});

export default StatusPresetPicker;
