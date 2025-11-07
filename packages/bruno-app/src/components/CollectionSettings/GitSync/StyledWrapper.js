import styled from 'styled-components';

const StyledWrapper = styled.div`
  .git-settings {
    max-width: 800px;

    h3 {
      font-size: 1.1rem;
      font-weight: 600;
      margin-bottom: 1rem;
      color: ${(props) => props.theme.text};
    }

    h4 {
      font-size: 0.95rem;
      font-weight: 600;
      margin-bottom: 0.75rem;
      color: ${(props) => props.theme.text};
    }

    .description {
      margin-bottom: 1.5rem;
      color: ${(props) => props.theme.colors.text.muted};
      line-height: 1.6;
    }
  }

  .warning-message {
    padding: 1.5rem;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 8px;
    color: #dc2626;

    h3 {
      color: #dc2626;
      margin-bottom: 0.75rem;
    }

    p {
      margin-bottom: 0.5rem;
      line-height: 1.6;
    }

    a {
      color: #dc2626;
      text-decoration: underline;
      font-weight: 600;
    }
  }

  .settings-section {
    margin-bottom: 2rem;
    padding-bottom: 1.5rem;
    border-bottom: 1px solid ${(props) => props.theme.table.border};

    &:last-child {
      border-bottom: none;
    }
  }

  .setting-item {
    margin-bottom: 1rem;

    .toggle-label {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      cursor: pointer;
      font-weight: 500;

      input[type="checkbox"] {
        width: 18px;
        height: 18px;
        cursor: pointer;
      }
    }
  }

  .info-item {
    display: flex;
    align-items: center;
    padding: 0.75rem 0;
    gap: 1rem;

    .label {
      font-weight: 600;
      color: ${(props) => props.theme.colors.text.muted};
      min-width: 150px;
    }

    .value {
      font-family: monospace;
      color: ${(props) => props.theme.text};
    }
  }

  .form-group {
    margin-bottom: 1.5rem;

    label {
      display: block;
      font-size: 0.9rem;
      font-weight: 600;
      margin-bottom: 0.5rem;
      color: ${(props) => props.theme.text};

      .optional {
        font-weight: 400;
        color: ${(props) => props.theme.colors.text.muted};
        font-size: 0.85rem;
      }
    }
  }

  .input-field {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid ${(props) => props.theme.modal.input.border};
    border-radius: 4px;
    font-size: 0.9rem;
    font-family: monospace;
    background-color: ${(props) => props.theme.modal.input.bg};
    color: ${(props) => props.theme.text};

    &:focus {
      outline: none;
      border: 1px solid ${(props) => props.theme.modal.input.focusBorder};
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    &::placeholder {
      color: ${(props) => props.theme.colors.text.muted};
    }
  }

  .input-group {
    display: flex;
    gap: 0.75rem;
    align-items: stretch;

    .input-field {
      flex: 1;
    }
  }

  .helper-text {
    margin-top: 0.5rem;
    font-size: 0.85rem;
    color: ${(props) => props.theme.colors.text.muted};
    line-height: 1.5;
  }

  .btn {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 4px;
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  .btn-primary {
    background: ${(props) => props.theme.button.secondary.bg};
    color: ${(props) => props.theme.button.secondary.color};
    border: 1px solid ${(props) => props.theme.button.secondary.border};

    &:hover:not(:disabled) {
      border-color: ${(props) => props.theme.button.secondary.hoverBorder};
    }
  }

  .btn-secondary {
    background-color: ${(props) => props.theme.modal.body.bg};
    color: ${(props) => props.theme.text};
    border: 1px solid ${(props) => props.theme.table.border};
    white-space: nowrap;

    &:hover:not(:disabled) {
      opacity: 0.9;
    }
  }

  .info-box {
    padding: 1.5rem;
    background-color: ${(props) => props.theme.modal.body.bg};
    border-radius: 8px;
    border: 1px solid ${(props) => props.theme.table.border};

    h4 {
      margin-bottom: 1rem;
    }

    ul {
      list-style: disc;
      padding-left: 1.5rem;
      margin: 0;

      li {
        margin-bottom: 0.5rem;
        color: ${(props) => props.theme.colors.text.muted};
        line-height: 1.6;
      }
    }
  }
`;

export default StyledWrapper;
