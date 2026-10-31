import styled from 'styled-components';

const StyledWrapper = styled.div`
  padding: 1rem;
  margin-bottom: 1.5rem;
  border-radius: 4px;
  font-size: 0.85rem;
  background: ${(props) => props.theme.status.info.background};
  border: 1px solid ${(props) => props.theme.status.info.border};
  color: ${(props) => props.theme.text};

  .merge-title {
    font-weight: 600;
    color: ${(props) => props.theme.status.info.text};
  }

  .merge-help {
    margin: 0.5rem 0 0.75rem;
    color: ${(props) => props.theme.colors.text.muted};

    code {
      font-family: monospace;
    }
  }

  .merge-files {
    list-style: none;
    margin: 0 0 0.75rem;
    padding: 0;
    max-height: 240px;
    overflow-y: auto;
  }

  .merge-file {
    padding: 0.35rem 0;
    border-top: 1px solid ${(props) => props.theme.table.border};
  }

  .merge-file-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .file-error {
    margin-top: 0.25rem;
    font-family: monospace;
    font-size: 0.75rem;
    color: ${(props) => props.theme.status.danger.text};
  }

  .file-name {
    font-family: monospace;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-state {
    flex-shrink: 0;
    font-size: 0.75rem;
    font-weight: 600;
    color: ${(props) => props.theme.status.warning.text};

    /* not "fixed": Tailwind's global .fixed utility would set position: fixed */
    &.is-fixed {
      color: ${(props) => props.theme.status.success.text};
    }

    &.is-invalid {
      color: ${(props) => props.theme.status.danger.text};
    }
  }

  .merge-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }

  .secondary-button,
  .finish-button {
    padding: 0.5rem 1rem;
    border-radius: 4px;
    font-size: 0.85rem;
    cursor: pointer;

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  .secondary-button {
    background: ${(props) => props.theme.modal.body.bg};
    color: ${(props) => props.theme.text};
    border: 1px solid ${(props) => props.theme.table.border};
  }

  .finish-button {
    font-weight: 500;
    background: ${(props) => props.theme.button.secondary.bg};
    color: ${(props) => props.theme.button.secondary.color};
    border: 1px solid ${(props) => props.theme.button.secondary.border};

    &:hover:not(:disabled) {
      border-color: ${(props) => props.theme.button.secondary.hoverBorder};
    }
  }
`;

export default StyledWrapper;
