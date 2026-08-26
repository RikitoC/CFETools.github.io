(() => {
  const form = document.getElementById('dailyWorkReport');
  const printButton = document.getElementById('printForm');
  const resetButton = document.getElementById('resetForm');

  function autoGrow(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.max(textarea.scrollHeight, textarea.classList.contains('table-field') ? 31 : 68)}px`;
  }

  function initAutoGrow(root = document) {
    root.querySelectorAll('textarea.expandable').forEach((textarea) => {
      autoGrow(textarea);
      textarea.addEventListener('input', () => autoGrow(textarea));
    });
  }

  function createCell(label, extraClass = '') {
    const cell = document.createElement('td');
    const textarea = document.createElement('textarea');
    textarea.className = `expandable table-field ${extraClass}`.trim();
    textarea.rows = 1;
    textarea.setAttribute('aria-label', label);
    cell.appendChild(textarea);
    return cell;
  }

  function createActionCell(rowLabel) {
    const cell = document.createElement('td');
    cell.className = 'row-actions no-print';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'icon-button remove-row';
    button.title = 'Remove row';
    button.setAttribute('aria-label', `Remove ${rowLabel} row`);
    button.textContent = '×';
    cell.appendChild(button);
    return cell;
  }

  function addRow(tableId) {
    const table = document.getElementById(tableId);
    const row = document.createElement('tr');

    if (tableId === 'equipmentTable') {
      row.append(
        createCell('Equipment or unit description'),
        createCell('Serial number'),
        createCell('Equipment notes'),
        createActionCell('equipment')
      );
    } else {
      row.append(
        createCell('Part or material'),
        createCell('Part number'),
        createCell('Quantity', 'short-field'),
        createCell('Used or needed'),
        createActionCell('parts')
      );
    }

    table.querySelector('tbody').appendChild(row);
    initAutoGrow(row);
    row.querySelector('textarea')?.focus();
  }

  document.querySelectorAll('.add-row').forEach((button) => {
    button.addEventListener('click', () => addRow(button.dataset.table));
  });

  document.addEventListener('click', (event) => {
    const removeButton = event.target.closest('.remove-row');
    if (!removeButton) return;

    const row = removeButton.closest('tr');
    const tbody = row.closest('tbody');

    if (tbody.rows.length > 1) {
      row.remove();
    } else {
      row.querySelectorAll('textarea').forEach((field) => {
        field.value = '';
        autoGrow(field);
      });
    }
  });

  printButton.addEventListener('click', () => {
    document.querySelectorAll('textarea.expandable').forEach(autoGrow);
    window.print();
  });

  resetButton.addEventListener('click', () => {
    const hasContent = [...form.elements].some((element) => {
      if (element.type === 'checkbox') return element.checked;
      return typeof element.value === 'string' && element.value.trim() !== '';
    });

    if (!hasContent || window.confirm('Clear all entered report data?')) {
      form.reset();
      document.querySelectorAll('textarea.expandable').forEach(autoGrow);
    }
  });

  initAutoGrow();
})();
