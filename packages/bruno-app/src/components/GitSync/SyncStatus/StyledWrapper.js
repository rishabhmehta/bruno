import styled from 'styled-components';

const getColor = (color) => {
  const colors = {
    green: '#22c55e',
    yellow: '#f59e0b',
    red: '#ef4444',
    blue: '#3b82f6',
    gray: '#9ca3af'
  };
  return colors[color] || colors.gray;
};

const StyledWrapper = styled.div`
  .sync-status {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: ${(props) => getColor(props.color)};

    &.pulse {
      animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    }
  }

  .status-text {
    color: ${(props) => props.theme.colors.text.muted};
    font-size: 0.85rem;
  }

  @keyframes pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }
`;

export default StyledWrapper;
