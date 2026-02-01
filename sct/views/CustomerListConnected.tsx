import React, { useState } from 'react';
import { Customer, Invoice, Payment } from '../types';
import { customerAPI } from '../services/api';

interface CustomerListProps {
  customers: Customer[];
  setCustomers: React.Dispatch<React.SetStateAction<Customer[]>>;
  invoices: Invoice[];
  setInvoices: React.Dispatch<React.SetStateAction<Invoice[]>>;
  payments: Payment[];
  role: 'OWNER' | 'STAFF';
}

// Import the original CustomerList component
import OriginalCustomerList from './CustomerList';

const CustomerListConnected: React.FC<CustomerListProps> = (props) => {
  const [loading, setLoading] = useState(false);

  // Wrap setCustomers to also call the API
  const handleSetCustomers = async (updateFn: React.SetStateAction<Customer[]>) => {
    if (typeof updateFn === 'function') {
      props.setCustomers(updateFn);
    } else {
      props.setCustomers(updateFn);
    }
  };

  // Override customer operations to use API
  const enhancedProps = {
    ...props,
    setCustomers: (customers: React.SetStateAction<Customer[]>) => {
      // For now, just update local state
      // The API calls will be made from within CustomerList component
      props.setCustomers(customers);
    }
  };

  return <OriginalCustomerList {...enhancedProps} />;
};

export default CustomerListConnected;
