import styled from 'styled-components';

const StyledWrapper = styled.div`
  padding: 1rem;
  margin-bottom: 1.5rem;
  border-radius: 4px;
  font-size: 0.85rem;
  background: ${(props) => props.theme.status.warning.background};
  border: 1px solid ${(props) => props.theme.status.warning.border};
  color: ${(props) => props.theme.text};

  .resolver-title {
    font-weight: 600;
    color: ${(props) => props.theme.status.warning.text};
  }

  .resolver-help {
    margin: 0.5rem 0 0.75rem;
    color: ${(props) => props.theme.colors.text.muted};
  }

  .bulk-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
    color: ${(props) => props.theme.colors.text.muted};
  }

  .conflict-files {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 320px;
    overflow-y: auto;
  }

  .conflict-file {
    border-top: 1px solid ${(props) => props.theme.table.border};
    padding: 0.5rem 0;
  }

  .conflict-file-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .toggle-details {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    min-width: 0;
    background: transparent;
    border: none;
    padding: 0;
    cursor: pointer;
    color: ${(props) => props.theme.text};
  }

  .file-name {
    font-family: monospace;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .side-picker {
    display: flex;
    gap: 0.25rem;
    flex-shrink: 0;
  }

  .side-button {
    padding: 0.3rem 0.75rem;
    border-radius: 4px;
    font-size: 0.8rem;
    cursor: pointer;
    background: ${(props) => props.theme.modal.body.bg};
    color: ${(props) => props.theme.text};
    border: 1px solid ${(props) => props.theme.table.border};

    &.selected {
      background: ${(props) => props.theme.status.info.background};
      border-color: ${(props) => props.theme.status.info.border};
      color: ${(props) => props.theme.status.info.text};
      font-weight: 600;
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  .conflict-hunks {
    margin: 0.5rem 0 0 1.25rem;
  }

  .conflict-hunk {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    margin-bottom: 0.5rem;
  }

  .conflict-side {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;

    pre {
      flex: 1;
      margin: 0;
      padding: 0.4rem 0.5rem;
      border-radius: 3px;
      font-size: 0.8rem;
      white-space: pre-wrap;
      word-break: break-all;
      background: ${(props) => props.theme.modal.body.bg};
      color: ${(props) => props.theme.text};
    }
  }

  .conflict-side-label {
    width: 3.5rem;
    flex-shrink: 0;
    padding-top: 0.4rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: ${(props) => props.theme.colors.text.muted};
  }

  .resolver-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin-top: 0.75rem;
  }

  .link-button {
    background: transparent;
    border: none;
    padding: 0;
    cursor: pointer;
    text-decoration: underline;
    color: ${(props) => props.theme.colors.text.muted};

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  .finish-button {
    padding: 0.5rem 1rem;
    border-radius: 4px;
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    background: ${(props) => props.theme.button.secondary.bg};
    color: ${(props) => props.theme.button.secondary.color};
    border: 1px solid ${(props) => props.theme.button.secondary.border};

    &:hover:not(:disabled) {
      border-color: ${(props) => props.theme.button.secondary.hoverBorder};
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }
`;

export default StyledWrapper;
