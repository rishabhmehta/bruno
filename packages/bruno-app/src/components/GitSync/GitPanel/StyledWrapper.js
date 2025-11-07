import styled from 'styled-components';

const StyledWrapper = styled.div`
  .git-panel {
    padding: 1rem;
  }

  .panel-header {
    margin-bottom: 1.5rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid ${(props) => props.theme.table.border};
  }

  .branch-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.95rem;
  }

  .branch-label {
    font-weight: 600;
    color: ${(props) => props.theme.colors.text.muted};
  }

  .branch-name {
    font-family: monospace;
    background-color: ${(props) => props.theme.modal.body.bg};
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
  }

  .last-sync {
    margin-top: 0.5rem;
    font-size: 0.85rem;
    color: ${(props) => props.theme.colors.text.muted};
  }

  .files-section {
    margin-bottom: 1.5rem;

    .files-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 0.75rem;
    }

    h3 {
      font-size: 0.9rem;
      font-weight: 600;
      margin: 0;
      color: ${(props) => props.theme.text};
    }
  }

  .file-list {
    list-style: none;
    padding: 0;
    margin: 0;
    max-height: 200px;
    overflow-y: auto;
  }

  .file-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    border-radius: 4px;
    font-size: 0.85rem;
    font-family: monospace;

    &:hover {
      background-color: ${(props) => props.theme.modal.body.bg};

      .btn-unstage {
        opacity: 1;
      }
    }
  }

  .file-status {
    width: 20px;
    height: 20px;
    border-radius: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.75rem;
    font-weight: 600;

    &.staged {
      background: #22c55e;
      color: white;
    }

    &.modified {
      background: #f59e0b;
      color: white;
    }
  }

  .file-path {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .btn-unstage {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.25rem;
    background: transparent;
    border: 1px solid ${(props) => props.theme.table.border};
    border-radius: 3px;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.2s, background-color 0.2s;
    color: ${(props) => props.theme.text};

    &:hover:not(:disabled) {
      background-color: ${(props) => props.theme.modal.body.bg};
      border-color: ${(props) => props.theme.colors.text.muted};
    }

    &:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }
  }

  .no-changes {
    color: ${(props) => props.theme.colors.text.muted};
    font-size: 0.85rem;
    font-style: italic;
  }

  .commit-section {
    margin-bottom: 1.5rem;

    label {
      display: block;
      font-size: 0.9rem;
      font-weight: 600;
      margin-bottom: 0.5rem;
    }
  }

  .commit-input {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid ${(props) => props.theme.modal.input.border};
    border-radius: 4px;
    font-size: 0.9rem;
    font-family: inherit;
    resize: vertical;
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
  }

  .actions {
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
  }

  .btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1.25rem;
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

  .btn-pull {
    background-color: ${(props) => props.theme.modal.body.bg};
    color: ${(props) => props.theme.text};
    border: 1px solid ${(props) => props.theme.table.border};

    &:hover:not(:disabled) {
      opacity: 0.9;
    }
  }

  .btn-stage-all {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.5rem 0.75rem;
    border: none;
    border-radius: 4px;
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    background-color: ${(props) => props.theme.modal.body.bg};
    color: ${(props) => props.theme.text};
    border: 1px solid ${(props) => props.theme.table.border};

    &:hover:not(:disabled) {
      opacity: 0.9;
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  .btn-commit-push {
    background: ${(props) => props.theme.button.secondary.bg};
    color: ${(props) => props.theme.button.secondary.color};
    border: 1px solid ${(props) => props.theme.button.secondary.border};

    &:hover:not(:disabled) {
      border-color: ${(props) => props.theme.button.secondary.hoverBorder};
    }
  }

  .error-message {
    padding: 1rem;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 4px;
    color: #dc2626;
    font-size: 0.85rem;
    margin-top: 1rem;

    strong {
      font-weight: 600;
    }

    pre {
      margin-top: 0.5rem;
      padding: 0.5rem;
      background: rgba(0, 0, 0, 0.05);
      border-radius: 3px;
      font-size: 0.8rem;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
  }

  .warning-message {
    padding: 1rem;
    background: #fffbeb;
    border: 1px solid #fcd34d;
    border-radius: 4px;
    color: #b45309;
    font-size: 0.85rem;
    margin-top: 1rem;

    strong {
      font-weight: 600;
    }

    ul {
      margin: 0.5rem 0 0 1.5rem;
      padding: 0;
    }

    li {
      margin: 0.25rem 0;
    }
  }
`;

export default StyledWrapper;
