import styled from 'styled-components';

const StyledWrapper = styled.div`
  .init-repo-content {
    padding: 1rem;
  }

  .description {
    margin-bottom: 1.5rem;
    color: ${(props) => props.theme.text};
    font-size: 0.95rem;
    line-height: 1.5;
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

  .helper-text {
    margin-top: 0.5rem;
    font-size: 0.85rem;
    color: ${(props) => props.theme.colors.text.muted};
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
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

  .btn-secondary {
    background-color: ${(props) => props.theme.modal.body.bg};
    color: ${(props) => props.theme.text};
    border: 1px solid ${(props) => props.theme.table.border};

    &:hover:not(:disabled) {
      opacity: 0.9;
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
`;

export default StyledWrapper;
