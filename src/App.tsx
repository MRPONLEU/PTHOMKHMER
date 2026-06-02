import React, { useState, useEffect, useMemo, useDeferredValue } from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Download, File as FileIcon, Search, Eye, EyeOff, HardDriveDownload, Calendar, Plus, Edit2, Trash2, X, LayoutGrid, Settings, Menu, UploadCloud, ChevronDown, Folder, GripVertical, ArrowUp, ArrowDown, LogOut, LogIn, Filter, Check, Loader2, Book, ArrowLeft, Pause } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { DocumentItem } from './types';
import { collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, query, where } from 'firebase/firestore';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { db, auth, googleProvider, handleFirestoreError, OperationType } from './firebase';

const CircularProgress = ({ progress, size = 20, strokeWidth = 3, color = 'text-blue-500' }: { progress: number, size?: number, strokeWidth?: number, color?: string }) => {
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
        <path
          className="text-white/20"
          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
        />
        <path
          className={`${color} transition-all duration-200 ease-out`}
          strokeDasharray={`${progress}, 100`}
          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
        />
      </svg>
      {/* Optional pause icon in the middle, or just keep it simple */}
      <Pause size={size * 0.45} className="absolute text-white/80" fill="currentColor" />
    </div>
  );
};

interface User {
  email: string;
  displayName?: string;
  photoURL?: string;
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [docs, setDocs] = useState<DocumentItem[]>([]);
// Initialize activeTab 'manage' and manageTab 'dashboard' if that's the intended default
  const [activeTab, setActiveTab] = useState<'view' | 'manage'>('view');
  const [manageTab, setManageTab] = useState<'dashboard' | 'docs' | 'types' | 'admins'>('dashboard');
  const [searchTerm, setSearchTerm] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isManageExpanded, setIsManageExpanded] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState<{type: string, subType: string | null} | null>(null);
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const [viewingDoc, setViewingDoc] = useState<DocumentItem | null>(null);
  const [downloadingStates, setDownloadingStates] = useState<Record<string, number>>({});
  const [isDocLoading, setIsDocLoading] = useState(true);

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories(prev => 
      prev.includes(categoryId) ? prev.filter(id => id !== categoryId) : [...prev, categoryId]
    );
  };

  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [editingAdminEmail, setEditingAdminEmail] = useState<string | null>(null);
  const [newAdminRole, setNewAdminRole] = useState('admin');

  // Category State
  const [categories, setCategories] = useState<any[]>([]);
  const [admins, setAdmins] = useState<any[]>([]);
  const [isAdminState, setIsAdminState] = useState(false);

  // Loading & Error State
  const [isLoadingDocs, setIsLoadingDocs] = useState(true);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [quotaError, setQuotaError] = useState(false);
  const isLoading = isLoadingDocs || isLoadingCategories;

  // 1. Dynamics Auth state synchronization
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        const u = {
          email: user.email?.toLowerCase() || '',
          displayName: user.displayName || user.email?.toLowerCase().split('@')[0],
          photoURL: user.photoURL || undefined
        };
        setCurrentUser(u);
      } else {
        setCurrentUser(null);
      }
    });
    return () => {
      unsubscribeAuth();
    };
  }, []);

  // 2. Categories subscription (Always allowed publicly)
  useEffect(() => {
    const unsubscribeCats = onSnapshot(collection(db, 'categories'), (snapshot) => {
      const items: any[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        items.push({
          id: doc.id,
          name: data.name,
          subTypes: data.subTypes || []
        });
      });
      setCategories(items);
      setIsLoadingCategories(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'categories');
    });
    return () => {
      unsubscribeCats();
    };
  }, []);

  // 3. Admins subscription (Only when signed in)
  useEffect(() => {
    if (!currentUser) {
      setAdmins([
        { email: 'broponleu998@gmail.com', addedAt: '2026-06-01' },
        { email: 'mrponleu20000@gmail.com', addedAt: '2026-06-01' }
      ]);
      return;
    }
    const unsubscribeAdmins = onSnapshot(collection(db, 'admins'), (snapshot) => {
      const items: any[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        items.push({
          email: doc.id,
          addedAt: data.addedAt || ''
        });
      });
      if (items.length === 0) {
        setAdmins([
          { email: 'broponleu998@gmail.com', addedAt: '2026-06-01' },
          { email: 'mrponleu20000@gmail.com', addedAt: '2026-06-01' }
        ]);
      } else {
        setAdmins(items);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'admins');
    });
    return () => {
      unsubscribeAdmins();
    };
  }, [currentUser]);

  // 4. Docs subscription (Depends dynamically on administrative role status)
  useEffect(() => {
    const docsRef = collection(db, 'docs');
    const q = isAdminState
      ? docsRef
      : query(docsRef, where('isHidden', '==', false));

    const unsubscribeDocs = onSnapshot(q, (snapshot) => {
      const items: DocumentItem[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        items.push({
          id: doc.id,
          title: data.title || '',
          description: data.description || '',
          coverUrl: data.coverUrl || '',
          fileSize: data.fileSize || '',
          fileType: data.fileType || '',
          downloadUrl: data.downloadUrl || '',
          uploadDate: data.uploadDate || '',
          downloads: Number(data.downloads || 0),
          type: data.type || '',
          subType: data.subType || '',
          isHidden: !!data.isHidden,
          tags: data.tags || []
        });
      });
      setDocs(items);
      setIsLoadingDocs(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'docs');
    });

    return () => {
      unsubscribeDocs();
    };
  }, [isAdminState]);

  useEffect(() => {
    if (currentUser) {
      const emailLower = currentUser.email.toLowerCase();
      const isMaster = emailLower === 'broponleu998@gmail.com' || emailLower === 'mrponleu20000@gmail.com';
      if (isMaster) {
        setIsAdminState(true);
      } else {
        const isAdmin = admins.some(a => a.email?.toLowerCase() === emailLower);
        setIsAdminState(isAdmin);
      }
    } else {
      setIsAdminState(false);
    }
  }, [currentUser, admins]);

  const signInWithGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      showNotification('ចូលគណនីទទួលបានជោគជ័យ');
    } catch (error: any) {
      console.error(error);
      // Fallback offline email modal robust activation if blocker or popup is absent
      setIsLoginModalOpen(true);
    }
  };

  const handleLoginSubmit = () => {
    if (loginEmail) {
      const emailLower = loginEmail.toLowerCase();
      const user = { email: emailLower, displayName: emailLower.split('@')[0] };
      setCurrentUser(user);
      setIsLoginModalOpen(false);
      setLoginEmail('');
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      setCurrentUser(null);
      showNotification('បានចាកចេញពីគណនី');
    } catch (error) {
      console.error(error);
    }
  };

  const getDriveImageUrl = (url: string) => {
    if (!url || typeof url !== 'string' || !url.includes('drive.google.com/file/d/')) return url;
    const segments = url.split('/d/');
    if (segments.length < 2) return url;
    const id = segments[1].split('/')[0];
    return `https://drive.google.com/uc?export=view&id=${id}`;
  };

  const getDriveEmbedUrl = (url: string) => {
    if (!url || typeof url !== 'string' || !url.includes('drive.google.com/')) return url;
    return url.replace('/view?', '/preview?').replace('/edit?', '/preview?');
  };

  const handleView = (doc: DocumentItem) => {
    setIsDocLoading(true);
    setViewingDoc(doc);
  };


  const isAdminUser = isAdminState;


  // Inline Category Management State
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newSubTypeNames, setNewSubTypeNames] = useState<{[key: string]: string}>({});
  const [manageExpandedCategoryIds, setManageExpandedCategoryIds] = useState<string[]>([]);

  const handleInlineAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    try {
      const id = Date.now().toString() + Math.random().toString(36).substring(2, 9);
      await setDoc(doc(db, 'categories', id), {
        id,
        name: newCategoryName.trim(),
        subTypes: []
      });
      setNewCategoryName('');
      showNotification('បន្ថែមប្រភេទឯកសារបានជោគជ័យ');
    } catch (e) {
      console.error(e);
      showNotification('មានបញ្ហាពេលបន្ថែមប្រភេទ', 'error');
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: any) => {
    const { active, over } = event;

    if (active.id !== over.id) {
      setCategories((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);

        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const SortableCategoryItem = ({ category, index }: { category: any, index: number }) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
    } = useSortable({ id: category.id });
    
    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
    };
    
    const isExpanded = manageExpandedCategoryIds.includes(category.id);
    
    return (
      <div ref={setNodeRef} style={style} key={category.id} className="bg-[#161B22] border border-white/5 rounded-2xl overflow-hidden flex flex-col">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 bg-[#161B22] gap-3">
          <div className="flex items-center gap-2 sm:gap-4 flex-1 cursor-pointer min-w-0" onClick={() => toggleManageCategoryExpansion(category.id)}>
            <div {...attributes} {...listeners} className="text-slate-500 hover:text-slate-300 transition-colors shrink-0 cursor-grab">
              <GripVertical size={18} className="sm:w-5 sm:h-5" />
            </div>
            <button className="text-slate-400 hover:text-white transition-colors p-1 rounded-md hover:bg-white/5 shrink-0">
              <ChevronDown size={18} className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
            </button>
            <span className="text-white font-bold text-base flex-1 truncate" title={category.name}>{category.name}</span>
          </div>
          <div className="flex items-center justify-between sm:justify-end gap-1 sm:gap-2 border-t sm:border-t-0 sm:border-l border-white/10 pt-3 sm:pt-0 sm:pl-4 mt-1 sm:mt-0 px-1 sm:px-0 shrink-0">
            <div className="flex items-center gap-1 sm:gap-2">
              <button 
                onClick={(e) => { e.stopPropagation(); openEditCategoryModal(category); }}
                className="p-2.5 sm:p-2 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 rounded transition-colors"
              >
                <Edit2 size={16} className="sm:w-4 sm:h-4 w-5 h-5" />
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); handleDeleteCategory(category.id); }}
                className="p-2.5 sm:p-2 text-rose-500 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors flex items-center gap-1.5"
              >
                <Trash2 size={16} className="sm:w-4 sm:h-4 w-5 h-5" />
                <span className="sm:hidden text-xs font-medium">លុប</span>
              </button>
            </div>
          </div>
        </div>
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden bg-[#0A0C10]/30 border-t border-white/5"
            >
              <div className="p-6 flex flex-col gap-4">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                  ប្រភេទរង (SUB-CATEGORIES):
                </div>
                {category.subTypes.length === 0 ? (
                  <div className="text-slate-500 text-sm italic">គ្មានប្រភេទរងទេ (No sub-categories)</div>
                ) : (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {category.subTypes.map((sub: string) => (
                      <span key={sub} className="bg-[#0A0C10] text-slate-300 px-3 py-1 rounded-full text-xs border border-white/5 flex items-center gap-2">
                        {sub}
                        <button onClick={() => handleRemoveSubType(category.id, sub)} className="text-rose-500 hover:text-rose-400">
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  const handleInlineAddSubType = async (categoryId: string) => {
    const subName = newSubTypeNames[categoryId];
    if (!subName || !subName.trim()) return;
    
    const category = categories.find(c => c.id === categoryId);
    if (!category) return;
    
    try {
      const newSubTypes = Array.from(new Set([...category.subTypes, subName.trim()]));
      await updateDoc(doc(db, 'categories', categoryId), {
        subTypes: newSubTypes
      });
      setNewSubTypeNames({ ...newSubTypeNames, [categoryId]: '' });
      showNotification('បន្ថែមប្រភេទរងបានជោគជ័យ');
    } catch (e) {
      console.error(e);
      showNotification('មានបញ្ហាពេលបន្ថែមប្រភេទរង', 'error');
    }
  };
  
  const handleRemoveSubType = (categoryId: string, subTypeToRemove: string) => {
    setDeleteConfirm({ isOpen: true, type: 'subType', id: categoryId, extra: subTypeToRemove });
  };
  
  const toggleManageCategoryExpansion = (categoryId: string) => {
    setManageExpandedCategoryIds(prev => 
      prev.includes(categoryId) ? prev.filter(id => id !== categoryId) : [...prev, categoryId]
    );
  };

  const handleMoveCategoryUp = (index: number) => {
    // Ordering not persisted to Firebase in this simple implementation
  };

  const handleMoveCategoryDown = (index: number) => {
    // Ordering not persisted to Firebase in this simple implementation
  };


  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<DocumentItem | null>(null);
  const [formData, setFormData] = useState<Partial<DocumentItem>>({});
  const [tagsInput, setTagsInput] = useState('');

  // Category Modal State
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [categoryModalMode, setCategoryModalMode] = useState<'category' | 'subtype'>('category');
  const [editingCategory, setEditingCategory] = useState<any | null>(null);
  const [categoryFormData, setCategoryFormData] = useState<{name: string, subTypes: string}>({ name: '', subTypes: '' });
  
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null);

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 3000);
  };

  const deferredSearchTerm = useDeferredValue(searchTerm);

  const filteredDocs = useMemo(() => {
    return docs.filter(doc => {
      if (activeTab === 'view' && doc.isHidden) return false;
      const searchLower = deferredSearchTerm.toLowerCase().trim();
      const matchesSearch = doc.title.toLowerCase().includes(searchLower) || 
                            (doc.description && doc.description.toLowerCase().includes(searchLower)) ||
                            (doc.type && doc.type.toLowerCase().includes(searchLower)) ||
                            (doc.subType && doc.subType.toLowerCase().includes(searchLower)) ||
                            (doc.tags && doc.tags.some(tag => tag.toLowerCase().includes(searchLower)));
      const matchesType = typeFilter 
        ? (doc.type === typeFilter.type && (!typeFilter.subType || doc.subType === typeFilter.subType))
        : true;
      return matchesSearch && matchesType;
    });
  }, [docs, deferredSearchTerm, typeFilter, activeTab]);

  const groupedDocs = useMemo(() => {
    const groups: { [key: string]: typeof docs } = {};
    filteredDocs.forEach(doc => {
      const type = doc.type || 'ផ្សេងៗ';
      if (!groups[type]) {
        groups[type] = [];
      }
      groups[type].push(doc);
    });
    
    return Object.keys(groups).sort((a, b) => {
      if (a === 'ផ្សេងៗ') return 1;
      if (b === 'ផ្សេងៗ') return -1;
      return a.localeCompare(b, 'km');
    }).map(key => ({
      type: key,
      docs: groups[key]
    }));
  }, [filteredDocs]);

  // Form Handlers
  const openAddModal = () => {
    setEditingDoc(null);
    setTagsInput('');
    setFormData({
      title: '', 
      coverUrl: 'https://images.unsplash.com/photo-1558021211-6d1403321394?w=500&auto=format&fit=crop&q=60', 
      downloadUrl: '#', 
      uploadDate: new Date().toISOString().split('T')[0],
      downloads: 0,
      tags: []
    });
    setIsModalOpen(true);
  };

  const openEditModal = (doc: DocumentItem) => {
    setEditingDoc(doc);
    setTagsInput(doc.tags ? doc.tags.join(', ') : '');
    setFormData(doc);
    setIsModalOpen(true);
  };

  const [deleteConfirm, setDeleteConfirm] = useState<{isOpen: boolean, type: 'doc' | 'category' | 'subType', id: string, extra?: string}>({isOpen: false, type: 'doc', id: ''});

  const handleDelete = (id: string) => {
    setDeleteConfirm({ isOpen: true, type: 'doc', id });
  };

  const handleToggleHide = async (docObj: DocumentItem) => {
    try {
      await updateDoc(doc(db, 'docs', docObj.id), {
        isHidden: !docObj.isHidden
      });
    } catch(e) {
      console.error("Error toggling hide:", e);
    }
  };

  const openAddCategoryModal = () => {
    setEditingCategory(null);
    setCategoryModalMode('category');
    setCategoryFormData({ name: '', subTypes: '' });
    setIsCategoryModalOpen(true);
  };

  const openAddSubTypeModal = () => {
    setEditingCategory(null);
    setCategoryModalMode('subtype');
    setCategoryFormData({ name: categories.length > 0 ? categories[0].name : '', subTypes: '' });
    setIsCategoryModalOpen(true);
  };

  const openEditCategoryModal = (category: any) => {
    setEditingCategory(category);
    setCategoryModalMode('category');
    setCategoryFormData({ name: category.name, subTypes: category.subTypes.join(', ') });
    setIsCategoryModalOpen(true);
  };

  const handleDeleteCategory = (id: string) => {
    setDeleteConfirm({ isOpen: true, type: 'category', id });
  };

  const proceedDelete = async () => {
    try {
      if (deleteConfirm.type === 'doc') {
        await deleteDoc(doc(db, 'docs', deleteConfirm.id));
      } else if (deleteConfirm.type === 'category') {
        await deleteDoc(doc(db, 'categories', deleteConfirm.id));
      } else if (deleteConfirm.type === 'subType' && deleteConfirm.extra) {
        const category = categories.find(c => c.id === deleteConfirm.id);
        if (category) {
          await updateDoc(doc(db, 'categories', deleteConfirm.id), {
            subTypes: category.subTypes.filter((s: string) => s !== deleteConfirm.extra)
          });
        }
      }
      showNotification('លុបទិន្នន័យបានជោគជ័យ');
    } catch (e) {
      console.error(e);
      showNotification('មានបញ្ហាពេលលុបទិន្នន័យ', 'error');
    }
    setDeleteConfirm({ isOpen: false, type: 'doc', id: '' });
  };

  const handleDownload = async (docObj: DocumentItem) => {
    if (downloadingStates[docObj.id] !== undefined) return;

    let downloadUrl = docObj.downloadUrl;
    const isDrive = downloadUrl && downloadUrl.includes('drive.google.com');
    if (isDrive) {
      const regex = /\/d\/([a-zA-Z0-9_-]+)/;
      const match = downloadUrl.match(regex);
      if (match && match[1]) {
        downloadUrl = `https://drive.google.com/uc?export=download&id=${match[1]}`;
      }
    }

    setDownloadingStates(prev => ({ ...prev, [docObj.id]: 0 }));
    let success = false;

    try {
      // Try using the File System Access API to force a native save dialog
      if ('showSaveFilePicker' in window && !isDrive) {
        const fileHandle = await (window as any).showSaveFilePicker({
          suggestedName: docObj.title || 'document',
        });
        
        let progress = 10;
        const interval = setInterval(() => {
          progress += Math.floor(Math.random() * 10) + 2;
          if (progress > 80) progress = 80;
          setDownloadingStates(prev => ({ ...prev, [docObj.id]: progress }));
        }, 300);

        const response = await fetch(downloadUrl);
        if (!response.ok) throw new Error('Network error');
        const blob = await response.blob();
        
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        
        clearInterval(interval);
        success = true;
      }
    } catch (e: any) {
      if (e.name === 'AbortError') {
        // User explicitly cancelled the Save dialog
        setDownloadingStates(prev => {
          const next = { ...prev };
          delete next[docObj.id];
          return next;
        });
        return;
      }
      console.warn("Native file picker failed or CORS blocked:", e);
    }

    if (!success) {
      // Fallback for browsers without File System Access API or Google Drive links (which block CORS)
      let progress = 10;
      const interval = setInterval(() => {
        progress += Math.floor(Math.random() * 15) + 5;
        if (progress > 90) progress = 90;
        setDownloadingStates(prev => ({ ...prev, [docObj.id]: progress }));
      }, 200);

      const link = document.createElement('a');
      link.href = downloadUrl;
      link.target = '_blank';
      link.download = docObj.title || 'document';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      setTimeout(() => clearInterval(interval), 1500);
    }

    setDownloadingStates(prev => ({ ...prev, [docObj.id]: 100 }));

    try {
      await updateDoc(doc(db, 'docs', docObj.id), {
        downloads: (docObj.downloads || 0) + 1
      });
    } catch (e) {
      console.error("Error incrementing downloads:", e);
    }

    setTimeout(() => {
      setDownloadingStates(prev => {
        const next = { ...prev };
        delete next[docObj.id];
        return next;
      });
    }, 1500);
  };

  const handleCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const subs = categoryFormData.subTypes.split(',').map(s => s.trim()).filter(s => s);
    try {
      if (editingCategory) {
        await updateDoc(doc(db, 'categories', editingCategory.id), {
          name: categoryFormData.name,
          subTypes: subs
        });
      } else {
        if (categoryModalMode === 'subtype') {
          const category = categories.find(c => c.name === categoryFormData.name);
          if (category) {
            const newSubtypes = Array.from(new Set([...category.subTypes, ...subs]));
            await updateDoc(doc(db, 'categories', category.id), {
              subTypes: newSubtypes
            });
          }
        } else {
          const id = Date.now().toString() + Math.random().toString(36).substring(2, 9);
          await setDoc(doc(db, 'categories', id), {
            id,
            name: categoryFormData.name,
            subTypes: subs
          });
        }
      }
      setIsCategoryModalOpen(false);
      showNotification('រក្សាទុកប្រភេទឯកសារបានជោគជ័យ');
    } catch (e) {
      console.error(e);
      showNotification('មានបញ្ហាពេលរក្សាទុកប្រភេទឯកសារ', 'error');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const finalData = { 
        ...formData, 
        tags: tagsInput.split(',').map(t => t.trim()).filter(Boolean) 
      };
      
      const details = {
        title: finalData.title || '',
        description: finalData.description || '',
        coverUrl: finalData.coverUrl || '',
        fileSize: finalData.fileSize || '',
        fileType: finalData.fileType || '',
        downloadUrl: finalData.downloadUrl || '',
        uploadDate: finalData.uploadDate || '',
        downloads: Number(finalData.downloads || 0),
        type: finalData.type || '',
        subType: finalData.subType || '',
        isHidden: !!finalData.isHidden,
        tags: finalData.tags || []
      };

      if (editingDoc) {
        await updateDoc(doc(db, 'docs', editingDoc.id), details);
      } else {
        const id = Date.now().toString() + Math.random().toString(36).substring(2, 9);
        await setDoc(doc(db, 'docs', id), {
          id,
          ...details
        });
      }
      setIsModalOpen(false);
      showNotification('រក្សាទុកបានជោគជ័យ');
    } catch (e) {
      console.error(e);
      showNotification('មានបញ្ហាពេលរក្សាទុក', 'error');
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 20 * 1024 * 1024) {
        showNotification('រូបភាពធំពេក', 'error');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          // Scale down image to max 800px
          const MAX_SIZE = 800;
          if (width > height) {
            if (width > MAX_SIZE) {
              height *= MAX_SIZE / width;
              width = MAX_SIZE;
            }
          } else {
            if (height > MAX_SIZE) {
              width *= MAX_SIZE / height;
              height = MAX_SIZE;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          
          // Compress to 70% quality JPEG
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          
          if (dataUrl.length > 900000) {
            showNotification('រូបភាពនៅតែធំពេក សូមជ្រើសរើសរូបភាពផ្សេង', 'error');
            return;
          }
          setFormData({ ...formData, coverUrl: dataUrl });
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const inputClasses = "w-full bg-[#0A0C10] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors";
  const labelClasses = "block text-xs font-medium text-slate-400 mb-1.5";



  return (
    <div className="flex h-screen bg-[#0A0C10] text-[#E2E8F0] font-sans overflow-hidden">
      {quotaError && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-rose-500/90 text-white text-center py-2 px-4 shadow-lg flex items-center justify-center gap-2">
          <span>បច្ចុប្បន្នភាពមូលដ្ឋានទិន្នន័យលើសកំណត់ (Quota limit exceeded). សូមព្យាយាមម្តងទៀតនៅថ្ងៃស្អែក ឬភ្ជាប់កាតបង់ប្រាក់ក្នុង Firebase Project.</span>
          <button onClick={() => setQuotaError(false)} className="ml-4 hover:opacity-80 p-1"><X size={16} /></button>
        </div>
      )}
      
      {/* Sidebar Overlay for Mobile */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 bg-[#0A0C10] border-r border-white/10 w-64 z-40 transform transition-transform duration-300 ease-in-out flex flex-col ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>
        <div className="h-20 flex items-center justify-between px-6 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-sm shrink-0">
              <Book size={18} className="text-white" />
            </div>
            <h1 className="text-2xl font-normal tracking-tight text-white font-['KH-ABC-TEXT']">បណ្ណាល័យ<span className="text-blue-500">បឋម</span></h1>
          </div>
          <button 
            className="lg:hidden text-slate-400 hover:text-white"
            onClick={() => setIsSidebarOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4 flex flex-col gap-2 flex-1 overflow-y-auto">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 px-2 mt-4">ម៉ឺនុយ</div>
          
          {isAdminUser && (
            <button
              onClick={() => { setActiveTab('manage'); setManageTab('dashboard'); setIsSidebarOpen(false); }}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition-colors ${activeTab === 'manage' && manageTab === 'dashboard' ? 'bg-blue-600/10 text-blue-500' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
            >
              <LayoutGrid size={18}/> គ្រប់គ្រងទូទៅ
            </button>
          )}

          <button
            onClick={() => { setActiveTab('view'); setTypeFilter(null); setIsSidebarOpen(false); setSearchTerm(''); }}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition-colors ${activeTab === 'view' && !typeFilter ? 'bg-blue-600/10 text-blue-500' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
          >
            <Book size={18}/> ឯកសារទាំងអស់
          </button>
          
          {isAdminUser && (
            <div className="flex flex-col">
              <button
                onClick={() => setIsManageExpanded(!isManageExpanded)}
                className={`flex items-center justify-between px-4 py-3 rounded-lg text-sm font-semibold transition-colors ${activeTab === 'manage' && manageTab !== 'dashboard' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
              >
                <div className="flex items-center gap-3">
                  <Settings size={18}/> គ្រប់គ្រងទិន្នន័យ
                </div>
                <ChevronDown size={14} className={`transition-transform duration-200 ${isManageExpanded ? 'rotate-180' : ''}`} />
              </button>
              <AnimatePresence>
                {isManageExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="pl-9 pr-3 py-1 flex flex-col gap-1 border-l-2 border-white/10 ml-6 mt-1">
                      <button
                        onClick={() => { setActiveTab('manage'); setManageTab('docs'); setIsSidebarOpen(false); }}
                        className={`text-left text-sm py-2 px-3 rounded-md transition-colors ${activeTab === 'manage' && manageTab === 'docs' ? 'bg-blue-600/20 text-blue-400 font-semibold' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}
                      >
                        គ្រប់គ្រងឯកសារ
                      </button>
                      <button
                        onClick={() => { setActiveTab('manage'); setManageTab('types'); setIsSidebarOpen(false); }}
                        className={`text-left text-sm py-2 px-3 rounded-md transition-colors ${activeTab === 'manage' && manageTab === 'types' ? 'bg-blue-600/20 text-blue-400 font-semibold' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}
                      >
                        ប្រភេទឯកសារ
                      </button>
                      <button
                        onClick={() => { setActiveTab('manage'); setManageTab('admins'); setIsSidebarOpen(false); }}
                        className={`text-left text-sm py-2 px-3 rounded-md transition-colors ${activeTab === 'manage' && manageTab === 'admins' ? 'bg-blue-600/20 text-blue-400 font-semibold' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}
                      >
                        គ្រប់គ្រងសិទ្ធិ (Admins)
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
          
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 px-2 mt-6">ប្រភេទឯកសារ</div>
          <div className="flex flex-col gap-1 pb-10">
            {categories.map((category) => {
              const isExpanded = expandedCategories.includes(category.id);
              const isActiveType = typeFilter?.type === category.name;
              
              return (
                <div key={category.id} className="flex flex-col">
                  <button 
                    onClick={() => toggleCategory(category.id)}
                    className={`flex items-center justify-between px-3 py-3 rounded-lg text-sm transition-colors cursor-pointer ${isActiveType && !typeFilter?.subType ? 'text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                  >
                    <div className="flex flex-1 items-center gap-3">
                      <Folder size={18} className={isActiveType ? "text-blue-500" : "text-slate-500"} />
                      <span className="font-medium text-left">{category.name}</span>
                    </div>
                    <ChevronDown size={16} className={`transition-transform duration-200 text-slate-500 ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>
                  
                  <AnimatePresence>
                    {isExpanded && category.subTypes.length > 0 && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="pl-6 pt-1 flex flex-col gap-1 border-l border-white/10 ml-6 mt-0.5">
                          <button 
                            onClick={() => {
                              setTypeFilter({ type: category.name, subType: null });
                              setActiveTab('view');
                              setIsSidebarOpen(false);
                              setSearchTerm('');
                            }}
                            className={`text-left text-xs sm:text-sm py-2 px-3 rounded-lg transition-colors uppercase tracking-tight font-bold ${isActiveType && !typeFilter?.subType ? 'text-blue-400 bg-white/5' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}
                          >
                            បង្ហាញទាំងអស់
                          </button>
                          {category.subTypes.map((sub, idx) => {
                            const isActiveSub = isActiveType && typeFilter?.subType === sub;
                            return (
                              <button 
                                key={idx} 
                                onClick={() => {
                                  setTypeFilter(isActiveSub ? { type: category.name, subType: null } : { type: category.name, subType: sub });
                                  setActiveTab('view');
                                  setIsSidebarOpen(false);
                                  setSearchTerm('');
                                }}
                                className={`text-left text-sm py-2 px-3 rounded-lg transition-colors ${isActiveSub ? 'text-blue-400 font-semibold bg-white/5' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}
                              >
                                {sub}
                              </button>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>

        {/* Auth Section */}
        <div className="mt-auto pt-4 border-t border-white/10 shrink-0 mb-4 px-2">
          {currentUser ? (
            <div className="flex items-center justify-between px-3 py-2 bg-white/5 rounded-lg border border-white/5">
              <div className="flex items-center gap-2 overflow-hidden">
                {currentUser.photoURL ? (
                  <img src={currentUser.photoURL} alt="Profile" className="w-8 h-8 rounded-full" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-xs">
                    {currentUser.email?.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white truncate">{currentUser.displayName || 'អ្នកប្រើប្រាស់'}</div>
                  <div className="text-[10px] text-slate-400 truncate">{currentUser.email}</div>
                </div>
              </div>
              <button 
                onClick={logout} 
                className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors"
                title="ចាកចេញ (Logout)"
              >
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <button 
              onClick={signInWithGoogle} 
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold transition-colors"
            >
              <LogIn size={18} />
              <span>ចូលគណនី (Login)</span>
            </button>
          )}
        </div>
      </aside>

      {/* Main Container */}
      <div className="flex-1 flex flex-col overflow-hidden w-full relative z-10">
        
        {/* Header */}
        <header className="bg-[#0A0C10] border-b border-white/10 h-20 shrink-0 flex items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="lg:hidden p-2 -ml-2 text-slate-400 hover:text-white transition-colors"
            >
              <Menu size={24} />
            </button>
          </div>

          <div className="flex-1 w-full max-w-[280px] sm:max-w-sm ml-auto">
            <div className={`relative flex items-center bg-[#161B22] border transition-all rounded-full shadow-inner h-10 ${searchTerm || typeFilter || isFilterDropdownOpen ? 'border-blue-500/50 bg-blue-500/5' : 'border-white/10 hover:border-white/20'}`}>
              <div className="pl-4 pr-2 flex items-center pointer-events-none text-slate-400 shrink-0">
                <Search className="h-4 w-4" />
              </div>
              
              {/* Active Filter Pill inside search */}
              <AnimatePresence>
                {typeFilter && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9, width: 0 }}
                    animate={{ opacity: 1, scale: 1, width: 'auto' }}
                    exit={{ opacity: 0, scale: 0.9, width: 0 }}
                    className="flex items-center gap-1 bg-blue-500/20 text-blue-400 pl-2.5 pr-1 py-1 rounded-full text-xs font-medium mr-1 whitespace-nowrap overflow-hidden shrink-0"
                  >
                    <span className="truncate max-w-[80px] sm:max-w-[150px]">{typeFilter.type} {typeFilter.subType ? `- ${typeFilter.subType}` : ''}</span>
                    <button 
                      onClick={() => {
                        setTypeFilter(null);
                        setActiveTab('view');
                        setSearchTerm('');
                      }} 
                      className="p-0.5 hover:bg-blue-500/20 hover:text-blue-300 rounded-full transition-colors flex-shrink-0"
                      title="លុបការត្រង (Clear filter)"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              <input
                type="text"
                placeholder={typeFilter ? "ស្វែងរក..." : "ស្វែងរកឯកសារ..."}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flex-1 min-w-0 py-0 h-full bg-transparent text-sm text-[#E2E8F0] placeholder-slate-500 focus:outline-none"
              />

              <div className="flex items-center gap-0.5 pr-1.5 shrink-0">
                {searchTerm && (
                  <button 
                    onClick={() => setSearchTerm('')}
                    className="p-1 text-slate-400 hover:text-white hover:bg-white/10 rounded-full transition-colors flex items-center justify-center h-7 w-7"
                    title="លុបពាក្យស្វែងរក (Clear search)"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
                
                <div className="w-px h-5 bg-white/10 mx-1"></div>

                <div className="relative">
                  <div 
                    className={`flex items-center justify-center w-8 h-8 rounded-full transition-colors cursor-pointer group ${typeFilter || isFilterDropdownOpen ? 'text-blue-400 bg-blue-500/10 hover:bg-blue-500/20' : 'text-slate-400 hover:text-white hover:bg-white/10'}`}
                    title="ត្រងឯកសារ (Filter)"
                    onClick={() => setIsFilterDropdownOpen(!isFilterDropdownOpen)}
                  >
                    <Filter className="h-4 w-4" />
                    {typeFilter && (
                      <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-blue-400 rounded-full border border-[#0A0C10]"></div>
                    )}
                  </div>
                  
                  <AnimatePresence>
                    {isFilterDropdownOpen && (
                      <>
                        <div 
                          className="fixed inset-0 z-40" 
                          onClick={() => setIsFilterDropdownOpen(false)}
                        />
                        <motion.div
                          initial={{ opacity: 0, y: 10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 10, scale: 0.95 }}
                          transition={{ duration: 0.2 }}
                          className="absolute right-0 top-full mt-3 w-72 bg-[#161B22] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col max-h-[70vh]"
                        >
                          <div className="p-2 overflow-y-auto custom-scrollbar">
                            {/* All Docs */}
                            <div 
                              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs cursor-pointer transition-colors bg-[#1E252E] border border-white/5"
                              onClick={() => {
                                setTypeFilter(null);
                                setIsFilterDropdownOpen(false);
                                setActiveTab('view');
                                setSearchTerm('');
                              }}
                            >
                              <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${!typeFilter ? 'border-blue-500' : 'border-slate-500'}`}>
                                {!typeFilter && <div className="w-2 h-2 rounded-full bg-blue-500"></div>}
                              </div>
                              <span className={!typeFilter ? "text-white font-medium" : "text-slate-300"}>ឯកសារទាំងអស់</span>
                            </div>
                            
                            {categories.map((c) => (
                              <div key={c.id} className="mt-4">
                                <div 
                                  className="flex items-center justify-between px-3 py-1 cursor-pointer"
                                  onClick={() => toggleCategory(c.id)}
                                >
                                  <div className="text-xs font-bold text-slate-500 tracking-wide uppercase">{c.name}</div>
                                  <ChevronDown size={14} className={`text-slate-500 transition-transform ${expandedCategories.includes(c.id) ? 'rotate-180' : ''}`} />
                                </div>
                                <div className="flex flex-col gap-1 mt-1">
                                  {expandedCategories.includes(c.id) && (
                                    <>
                                  {/* All in Category */}
                                  <div 
                                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs cursor-pointer transition-colors ${typeFilter?.type === c.name && !typeFilter?.subType ? 'bg-[#1E252E] border border-white/5 text-white font-medium' : 'text-slate-300 hover:bg-white/5 hover:text-slate-100'}`}
                                    onClick={() => {
                                      setTypeFilter({ type: c.name, subType: null });
                                      setIsFilterDropdownOpen(false);
                                      setActiveTab('view');
                                      setSearchTerm('');
                                    }}
                                  >
                                    <span>ទាំងអស់ក្នុង {c.name}</span>
                                  </div>
                                  
                                  {c.subTypes.map((sub: string) => {
                                    const isSubSelected = typeFilter?.type === c.name && typeFilter?.subType === sub;
                                    return (
                                      <div 
                                        key={sub}
                                        className={`flex items-center gap-3 pl-9 pr-3 py-2 rounded-lg text-xs cursor-pointer transition-colors ${isSubSelected ? 'text-blue-400 bg-white/5 border border-white/5 font-medium' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}
                                        onClick={() => {
                                          setTypeFilter({ type: c.name, subType: sub });
                                          setIsFilterDropdownOpen(false);
                                          setActiveTab('view');
                                          setSearchTerm('');
                                        }}
                                      >
                                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${isSubSelected ? 'border-blue-500' : 'border-slate-500'}`}>
                                          {isSubSelected && <div className="w-2 h-2 rounded-full bg-blue-500"></div>}
                                        </div>
                                        <span className="truncate">- {sub}</span>
                                      </div>
                                    );
                                  })}
                                    </>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto w-full px-4 sm:px-6 lg:px-8 py-8 flex flex-col gap-8">
        
        {/* Dynamic Headings based on Tab */}
        {((activeTab === 'manage' && isAdminUser) || (activeTab === 'view' && typeFilter)) && (
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 max-w-full">
            <div className="max-w-2xl">
              {activeTab === 'manage' && (
                <>
                  <h2 className="text-2xl font-extrabold text-white mb-3 leading-tight uppercase tracking-tight">
                    {manageTab === 'docs' ? 'គ្រប់គ្រងឯកសារ' : manageTab === 'types' ? 'ប្រភេទឯកសារ' : manageTab === 'dashboard' ? 'ផ្ទាំងរបាយការណ៍សង្ខេប' : 'គ្រប់គ្រងសិទ្ធិជាន់ខ្ពស់'}
                  </h2>
                  <p className="text-slate-400 text-base">
                    {manageTab === 'docs' ? 'បញ្ចូល កែប្រែ ឬលុបឯកសារចេញពីប្រព័ន្ធកណ្តាលរបស់អ្នក។' : manageTab === 'types' ? 'បង្ហាញ ឬបង្កើតប្រភេទឯកសារថ្មីៗ និងប្រភេទរងរបស់វា។' : manageTab === 'dashboard' ? 'មើលទិន្នន័យរួម និងចំណាត់ថ្នាក់ឯកសារ។' : 'បន្ថែមឫដកសិទ្ធិគណនីរបស់អ្នកផ្សេងឲ្យធ្វើជា Admin។'}
                  </p>
                </>
              )}
              {activeTab === 'view' && typeFilter && (
                <h2 className="text-2xl font-extrabold text-white mb-3 leading-tight uppercase tracking-tight">
                  {typeFilter.subType ? `${typeFilter.type} ${typeFilter.subType}` : typeFilter.type}
                </h2>
              )}
            </div>
            
            {activeTab === 'manage' && (
              <div className="flex gap-3 shrink-0">
                {manageTab === 'docs' && (
                  <button
                    onClick={openAddModal}
                    className="px-5 py-3 sm:py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl sm:rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-colors shadow-sm whitespace-nowrap w-full sm:w-auto"
                  >
                    <Plus size={18} />
                    បញ្ចូលឯកសារថ្មី
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <div className="mt-6">
          {activeTab === 'manage' && isAdminUser && manageTab === 'types' ? (
            <div className="flex flex-col gap-6 max-w-3xl pb-12">
              {/* Add New Category Card */}
              <div className="bg-[#161B22] border border-white/5 rounded-2xl p-6">
                <div className="flex flex-col gap-4">
                  <input 
                    type="text" 
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleInlineAddCategory()}
                    placeholder="បញ្ចូលប្រភេទឯកសារថ្មី" 
                    className="w-full bg-[#0A0C10] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                  <button 
                    onClick={handleInlineAddCategory}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 text-sm transition-colors"
                  >
                    <Plus size={18} /> បន្ថែម
                  </button>
                </div>
              </div>

              {/* Category List */}
              <div className="flex flex-col gap-4">
                {categories.map((category, index) => {
                  const isExpanded = manageExpandedCategoryIds.includes(category.id);
                  return (
                    <div key={category.id} className="bg-[#161B22] border border-white/5 rounded-2xl overflow-hidden flex flex-col">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 bg-[#161B22] gap-3">
                        <div className="flex items-center gap-2 sm:gap-4 flex-1 cursor-pointer min-w-0" onClick={() => toggleManageCategoryExpansion(category.id)}>
                          <div className="text-slate-500 hover:text-slate-300 transition-colors shrink-0">
                            <GripVertical size={18} className="sm:w-5 sm:h-5" />
                          </div>
                          <button className="text-slate-400 hover:text-white transition-colors p-1 rounded-md hover:bg-white/5 shrink-0">
                            <ChevronDown size={18} className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                          </button>
                          <span className="text-white font-bold text-base flex-1 truncate" title={category.name}>{category.name}</span>
                        </div>
                        <div className="flex items-center justify-between sm:justify-end gap-1 sm:gap-2 border-t sm:border-t-0 sm:border-l border-white/10 pt-3 sm:pt-0 sm:pl-4 mt-1 sm:mt-0 px-1 sm:px-0 shrink-0">
                          <div className="flex items-center gap-1 sm:gap-2">
                            <button 
                              onClick={(e) => { e.stopPropagation(); openEditCategoryModal(category); }}
                              className="p-2.5 sm:p-2 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 rounded transition-colors"
                            >
                              <Edit2 size={16} className="sm:w-4 sm:h-4 w-5 h-5" />
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleDeleteCategory(category.id); }}
                              className="p-2.5 sm:p-2 text-rose-500 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors flex items-center gap-1.5"
                            >
                              <Trash2 size={16} className="sm:w-4 sm:h-4 w-5 h-5" />
                              <span className="sm:hidden text-xs font-medium">លុប</span>
                            </button>
                          </div>
                        </div>
                      </div>
                      
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden bg-[#0A0C10]/30 border-t border-white/5"
                          >
                            <div className="p-6 flex flex-col gap-4">
                              <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                                ប្រភេទរង (SUB-CATEGORIES):
                              </div>
                              
                              {category.subTypes.length === 0 ? (
                                <div className="text-slate-500 text-sm italic">គ្មានប្រភេទរងទេ (No sub-categories)</div>
                              ) : (
                                <div className="flex flex-wrap gap-2 mb-2">
                                  {category.subTypes.map((sub, idx) => (
                                    <div key={idx} className="flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full pl-4 text-sm text-slate-300">
                                      <span>{sub}</span>
                                      <button onClick={() => handleRemoveSubType(category.id, sub)} className="text-slate-500 hover:text-red-400 hover:bg-white/5 rounded-full p-1 transition-colors ml-1">
                                        <X size={14} />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}


                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </div>
        ) : isLoading ? (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-24 bg-[#161B22] border border-white/5 rounded-2xl"
          >
            <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-4" />
            <h3 className="text-lg font-bold text-white mb-2">កំពុងទាញយកទិន្នន័យ...</h3>
            <p className="text-sm text-slate-400 text-center max-w-sm">សូមរង់ចាំបន្តិច ប្រព័ន្ធកំពុងរៀបចំឯកសារសម្រាប់អ្នក។</p>
          </motion.div>
        ) : filteredDocs.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-24 bg-[#161B22] border border-white/5 rounded-2xl"
          >
            <Search className="mx-auto h-12 w-12 text-slate-600 mb-4" />
            <h3 className="text-lg font-bold text-white">រកមិនឃើញឯកសារទេ</h3>
            <p className="mt-2 text-sm text-slate-400 max-w-sm mx-auto">
              ពុំមានឯកសារណាមួយស៊ីគ្នាជាមួយពាក្យគន្លឹះ <span className="font-semibold text-[#E2E8F0]">"{searchTerm}"</span> ទេ។
            </p>
          </motion.div>
        ) : activeTab === 'view' ? (
          <div className="flex flex-col gap-12">
            {groupedDocs.map((group) => (
              <div key={group.type}>
                <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                  <Folder className="text-blue-500" size={24} />
                  {group.type}
                  <span className="text-sm font-normal text-slate-500 bg-[#161B22] px-2.5 py-0.5 rounded-full border border-white/5 ml-2">
                    {group.docs.length}
                  </span>
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {group.docs.map((doc, index) => (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: 20 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      transition={{ duration: 0.4, delay: index * 0.05, ease: [0.23, 1, 0.32, 1] }}
                      key={doc.id}
                      className="group bg-[#161B22] border border-white/5 rounded-2xl overflow-hidden hover:border-blue-500/50 transition-colors flex flex-col"
                    >
                      {/* Cover Image */}
                      <div className="relative h-48 w-full bg-[#0A0C10] overflow-hidden">
                        <img
                          src={getDriveImageUrl(doc.coverUrl)}
                          alt={doc.title}
                          loading="lazy"
                          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-in-out"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#161B22] via-transparent to-transparent opacity-60 z-10 pointer-events-none" />
                      </div>

                      {/* Content */}
                      <div className="p-5 flex-1 flex flex-col relative z-20">
                        <h3 className="text-base font-bold text-white leading-[1.6] py-1 mb-3 line-clamp-2" title={doc.title}>
                          {doc.title}
                        </h3>
                        <div className="flex-1"></div>
                        
                        <div className="border-t border-white/10 pt-4 flex items-center justify-between mt-auto">
                          <div className="flex gap-4">
                            <motion.button
                              onClick={() => handleView(doc)}
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              className="flex items-center gap-2 text-emerald-500 hover:text-emerald-400 transition-colors cursor-pointer text-[15px] font-bold"
                            >
                              <Eye size={18} />
                              <span>មើល</span>
                            </motion.button>

                            <motion.button
                              onClick={() => handleDownload(doc)}
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              className="flex items-center gap-2 text-blue-500 hover:text-blue-400 transition-colors cursor-pointer text-[15px] font-bold"
                            >
                              {downloadingStates[doc.id] !== undefined ? (
                                <CircularProgress progress={downloadingStates[doc.id]} size={18} />
                              ) : (
                                <>
                                  <motion.div
                                    animate={{ y: [0, -2, 0] }}
                                    transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                                  >
                                    <Download size={18} />
                                  </motion.div>
                                  <span>ទាញយក</span>
                                </>
                              )}
                            </motion.button>

                          </div>

                          <div className="flex items-center gap-1.5 text-[13px] text-slate-400 font-medium tracking-wide" title="ចំនួនអ្នកទាញយក">
                            <Eye size={14} />
                            <span>{doc.downloads?.toLocaleString('km-KH') || 0}</span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : activeTab === 'manage' && isAdminUser && manageTab === 'docs' ? (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#161B22] border border-white/5 rounded-2xl overflow-hidden shadow-lg"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[700px]">
                <thead>
                  <tr className="border-b border-white/5 text-slate-400 text-xs uppercase tracking-wider bg-[#0A0C10]/50">
                    <th className="p-4 pl-6 font-medium">ឯកសារ</th>
                    <th className="p-4 font-medium w-40">ប្រភេទ</th>
                    <th className="p-4 font-medium w-32">ទាញយក</th>
                    <th className="p-4 pr-6 font-medium text-right w-32">សកម្មភាព</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDocs.map(doc => (
                    <tr key={doc.id} className={`border-b border-white/5 transition ${doc.isHidden ? 'bg-black/60 opacity-60 hover:bg-black/40' : 'hover:bg-white/[0.02]'}`}>
                      <td className="p-4 pl-6">
                        <div className="flex items-center gap-4">
                          <div className="w-14 h-14 rounded-lg bg-[#0A0C10] overflow-hidden shrink-0 relative border border-white/5">
                            <img src={getDriveImageUrl(doc.coverUrl)} alt="" loading="lazy" className="w-full h-full object-cover" />
                          </div>
                          <div>
                            <div className="text-white font-bold text-sm leading-[1.6] py-1 mb-1 line-clamp-2">{doc.title}</div>
                            {doc.tags && doc.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {doc.tags.map((tag, idx) => (
                                  <span key={idx} className="text-[10px] bg-blue-500/10 text-blue-400 font-medium px-2 py-0.5 rounded-md">{tag}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        {doc.type && (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-sm text-slate-300 font-medium">{doc.type}</span>
                            {doc.subType && <span className="text-[10px] text-slate-500">{doc.subType}</span>}
                          </div>
                        )}
                      </td>
                      <td className="p-4 text-sm text-slate-400 font-medium">
                        <div className="flex items-center gap-1.5" title="ចំនួនអ្នកទាញយក">
                          <Eye size={14} />
                          {doc.downloads?.toLocaleString('km-KH') || 0}
                        </div>
                      </td>
                      <td className="p-4 pr-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button 
                            onClick={() => handleToggleHide(doc)} 
                            className={`p-2 rounded-lg transition ${doc.isHidden ? 'text-blue-500 bg-blue-500/10' : 'text-slate-400 hover:text-blue-500 hover:bg-blue-500/10'}`}
                            title={doc.isHidden ? "បង្ហាញឯកសារ" : "លាក់ឯកសារ"}
                          >
                            {doc.isHidden ? <EyeOff size={16}/> : <Eye size={16}/>}
                          </button>
                          <button 
                            onClick={() => openEditModal(doc)} 
                            className="p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-500/10 rounded-lg transition"
                            title="កែប្រែ"
                          >
                            <Edit2 size={16}/>
                          </button>
                          <button 
                            onClick={() => handleDelete(doc.id)} 
                            className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition"
                            title="លុប"
                          >
                            <Trash2 size={16}/>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        ) : activeTab === 'manage' && isAdminUser && manageTab === 'dashboard' ? (
          <div className="flex flex-col gap-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="bg-[#161B22] border border-white/5 rounded-2xl p-6 flex items-center justify-between shadow-lg">
                <div>
                  <div className="text-slate-400 text-sm font-semibold mb-1 uppercase tracking-wider">ឯកសារសរុប</div>
                  <div className="text-4xl font-extrabold text-white">{docs.length.toLocaleString('km-KH')}</div>
                </div>
                <div className="w-16 h-16 bg-blue-500/10 text-blue-500 rounded-2xl flex flex-col items-center justify-center">
                  <FileIcon size={32} />
                </div>
              </div>
              <div className="bg-[#161B22] border border-white/5 rounded-2xl p-6 flex items-center justify-between shadow-lg">
                <div>
                  <div className="text-slate-400 text-sm font-semibold mb-1 uppercase tracking-wider">ការទាញយកសរុប</div>
                  <div className="text-4xl font-extrabold text-white">{docs.reduce((acc, doc) => acc + (doc.downloads || 0), 0).toLocaleString('km-KH')}</div>
                </div>
                <div className="w-16 h-16 bg-teal-500/10 text-teal-500 rounded-2xl flex flex-col items-center justify-center">
                  <Download size={32} />
                </div>
              </div>
            </div>

            <div className="bg-[#161B22] border border-white/5 rounded-2xl p-6 shadow-lg">
              <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                <ArrowUp size={20} className="text-amber-500" />
                ចំណាត់ថ្នាក់ទាញយកខ្ពស់បំផុត Top 5
              </h3>
              <div className="flex flex-col gap-3">
                {[...docs].sort((a, b) => (b.downloads || 0) - (a.downloads || 0)).slice(0, 5).map((doc, idx) => (
                  <div key={doc.id} className="flex items-center gap-4 p-3 bg-[#0A0C10] border border-white/5 rounded-xl">
                    <div className="text-xl font-black text-slate-600 w-6 shrink-0 text-center">{idx + 1}</div>
                    <img src={getDriveImageUrl(doc.coverUrl)} className="w-12 h-12 rounded-lg object-cover" alt="" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-white truncate">{doc.title}</div>
                      <div className="text-xs text-slate-400">{doc.type} {doc.subType ? `> ${doc.subType}` : ''}</div>
                    </div>
                    <div className="font-bold text-teal-400 text-sm bg-teal-500/10 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                      <Download size={14} /> {doc.downloads?.toLocaleString('km-KH') || 0}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : activeTab === 'manage' && isAdminUser && manageTab === 'admins' ? (
          <div className="flex flex-col gap-6 max-w-3xl">
            <div className="bg-[#161B22] border border-white/5 rounded-2xl p-6 shadow-lg">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row gap-3">
                  <input 
                    type="email" 
                    value={newAdminEmail}
                    onChange={(e) => setNewAdminEmail(e.target.value)}
                    id="newAdminEmail"
                    placeholder="ឧ. user@gmail.com" 
                    className="flex-1 bg-[#0A0C10] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter') {
                        const email = newAdminEmail.trim().toLowerCase();
                        if (email && email.includes('@')) {
                          try {
                            if (editingAdminEmail && editingAdminEmail !== email) {
                              await deleteDoc(doc(db, 'admins', editingAdminEmail));
                            }
                            await setDoc(doc(db, 'admins', email), {
                              email,
                              role: newAdminRole,
                              addedAt: new Date().toISOString()
                            });
                            
                            setNewAdminEmail('');
                            setEditingAdminEmail(null);
                            setNewAdminRole('admin');
                            showNotification(editingAdminEmail ? 'បានកែប្រែដោយជោគជ័យ' : 'បានបន្ថែម Admin ថ្មីដោយជោគជ័យ');
                          } catch (err) {
                             showNotification('គ្មានសិទ្ធិ ឬមានបញ្ហា', 'error');
                          }
                        }
                      }
                    }}
                  />
                  <select 
                    value={newAdminRole}
                    onChange={(e) => setNewAdminRole(e.target.value)}
                    className="bg-[#0A0C10] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                  >
                    <option value="admin">Admin ពេញសិទ្ធិ</option>
                    <option value="editor">Editor (ត្រឹមបញ្ចូល/កែប្រែ)</option>
                  </select>
                </div>
                
                <div className="flex gap-3">
                  {editingAdminEmail && (
                    <button 
                      onClick={() => {
                        setEditingAdminEmail(null);
                        setNewAdminEmail('');
                        setNewAdminRole('admin');
                      }}
                      className="px-5 py-3 rounded-xl flex items-center justify-center gap-2 text-sm text-slate-300 bg-white/5 hover:bg-white/10 font-bold transition-colors"
                    >
                      បោះបង់
                    </button>
                  )}
                  <button 
                    onClick={async () => {
                      const email = newAdminEmail.trim().toLowerCase();
                      if (email && email.includes('@')) {
                        try {
                          if (editingAdminEmail && editingAdminEmail !== email) {
                            await deleteDoc(doc(db, 'admins', editingAdminEmail));
                          }
                          await setDoc(doc(db, 'admins', email), {
                            email,
                            role: newAdminRole,
                            addedAt: new Date().toISOString()
                          });
                          setNewAdminEmail('');
                          setEditingAdminEmail(null);
                          setNewAdminRole('admin');
                          showNotification(editingAdminEmail ? 'បានកែប្រែដោយជោគជ័យ' : 'បានបន្ថែម Admin ថ្មីដោយជោគជ័យ');
                        } catch (err) {
                          showNotification('គ្មានសិទ្ធិ ឬមានបញ្ហា', 'error');
                        }
                      }
                    }}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 text-sm transition-colors"
                  >
                    {editingAdminEmail ? <><Check size={18} /> រក្សាទុកកែប្រែ</> : <><Plus size={18} /> បន្ថែមគណនី Admin</>}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <h3 className="text-slate-400 font-bold uppercase tracking-wider text-sm pl-2">បញ្ជី Admins ពិតប្រាកដ:</h3>
              <div className="flex items-center justify-between p-4 bg-[#161B22] border border-emerald-500/20 shadow-lg rounded-xl">
                 <div className="text-white font-semibold flex items-center gap-3">
                    <span className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-black">B</span>
                    broponleu998@gmail.com
                 </div>
                 <div className="text-xs bg-emerald-500/10 text-emerald-500 px-3 py-1 rounded-full border border-emerald-500/20 font-bold">MASTER</div>
              </div>
              <div className="flex items-center justify-between p-4 bg-[#161B22] border border-emerald-500/20 shadow-lg rounded-xl">
                 <div className="text-white font-semibold flex items-center gap-3">
                    <span className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-black">M</span>
                    mrponleu20000@gmail.com
                 </div>
                 <div className="text-xs bg-emerald-500/10 text-emerald-500 px-3 py-1 rounded-full border border-emerald-500/20 font-bold">MASTER</div>
              </div>
              
              <h3 className="text-slate-400 font-bold uppercase tracking-wider text-sm pl-2 mt-4">Admins បន្ថែម:</h3>
              {admins.length === 0 && <div className="text-slate-600 pl-2 text-sm">មិនទាន់មាន Admin បន្ថែមទេ...</div>}
              {admins.map((ad) => (
                <div key={ad.email} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-[#161B22] border border-white/5 rounded-xl group hover:border-white/10 transition-colors gap-3">
                  <div className="flex flex-col">
                    <div className="text-slate-200 font-bold">{ad.email}</div>
                    <div className="text-xs text-slate-400 font-medium tracking-wide mt-1 uppercase">
                      {ad.role === 'editor' ? '🔴 EDITOR' : '🔵 ADMIN'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => {
                        setEditingAdminEmail(ad.email);
                        setNewAdminEmail(ad.email);
                        setNewAdminRole(ad.role || 'admin');
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-500/10 rounded-lg transition-colors"
                    >
                      <Edit2 size={18} />
                    </button>
                    <button 
                      onClick={async () => {
                        if(window.confirm('តើអ្នកពិតជាចង់ដកសិទ្ធិ Admin នេះមែនទេ?')) {
                          try {
                            await deleteDoc(doc(db, 'admins', ad.email));
                            showNotification('បានដកសិទ្ធិជោគជ័យ');
                          } catch (e) {
                            showNotification('មានបញ្ហា', 'error');
                          }
                        }
                      }}
                      className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        </div>
      </main>
      </div>

      {/* Editor Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-xl bg-[#161B22] border-0 sm:border border-white/10 sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col h-full sm:h-auto sm:max-h-[90vh]"
            >
              <div className="px-6 py-5 border-b border-white/5 flex justify-between items-center bg-[#0A0C10]/50 shrink-0">
                <h3 className="text-lg font-bold text-white">{editingDoc ? 'កែប្រែទិន្នន័យឯកសារ' : 'បញ្ចូលឯកសារថ្មី'}</h3>
                <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-white/5 transition"><X size={20}/></button>
              </div>
              
              <div className="p-6 overflow-y-auto flex-1">
                <form id="doc-form" onSubmit={handleSubmit} className="flex flex-col gap-5">
                  <div>
                    <label className={labelClasses}>ចំណងជើង</label>
                    <input required type="text" value={formData.title || ''} onChange={e => setFormData({...formData, title: e.target.value})} className={inputClasses} placeholder="បញ្ចូលចំណងជើង..." />
                  </div>

                  <div>
                    <label className={labelClasses}>រូបថតក្រប</label>
                    <div className="relative w-full h-32 border-2 border-dashed border-white/20 rounded-lg bg-[#0A0C10] flex items-center justify-center overflow-hidden hover:border-blue-500/50 transition-colors group">
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={handleImageUpload} 
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" 
                      />
                      {formData.coverUrl && !formData.coverUrl.includes('unsplash.com/photo-1558021211') ? (
                        <>
                          <img src={getDriveImageUrl(formData.coverUrl || '')} className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-40 transition" alt="Cover preview" />
                          <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                            <span className="bg-black/60 backdrop-blur-sm text-white px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-2"><UploadCloud size={14}/> ផ្លាស់ប្តូររូបថត</span>
                          </div>
                        </>
                      ) : (
                        <div className="flex flex-col items-center gap-2 text-slate-500 group-hover:text-slate-300">
                          <UploadCloud size={24} />
                          <span className="text-sm font-medium">ជ្រើសរើសរូបភាព ឬអូសទម្លាក់នៅទីនេះ</span>
                        </div>
                      )}
                    </div>
                    <input 
                      type="text" 
                      value={formData.coverUrl && !formData.coverUrl.startsWith('data:image/') ? formData.coverUrl : ''} 
                      onChange={e => setFormData({...formData, coverUrl: e.target.value})} 
                      className={`${inputClasses} mt-2`} 
                      placeholder="ឬបញ្ចូលតំណភ្ជាប់រូបភាពក្រប (URL)..." 
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-5">
                    <div>
                      <label className={labelClasses}>ប្រភេទ (Type)</label>
                      <select value={formData.type || ''} onChange={e => setFormData({...formData, type: e.target.value, subType: ''})} className={inputClasses}>
                        <option value="" disabled>ជ្រើសរើសប្រភេទ...</option>
                        {categories.map((c) => (
                           <option key={c.id} value={c.name}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelClasses}>ប្រភេទរង (Sub Type)</label>
                      <select value={formData.subType || ''} onChange={e => setFormData({...formData, subType: e.target.value})} className={inputClasses} disabled={!formData.type}>
                         <option value="">ជ្រើសរើសប្រភេទរង...</option>
                         {formData.type && categories.find(c => c.name === formData.type)?.subTypes.map((sub, idx) => (
                           <option key={idx} value={sub}>{sub}</option>
                         ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className={labelClasses}>Tags / ពាក្យគន្លឹះ</label>
                    <input type="text" value={tagsInput || ''} onChange={e => setTagsInput(e.target.value)} className={inputClasses} placeholder="គណិតវិទ្យា, ថ្នាក់ទី១, ..." />
                    <p className="text-xs text-slate-500 mt-1">បំបែកពាក្យនីមួយៗដោយប្រើសញ្ញាក្បៀស (,)</p>
                  </div>

                  <div>
                    <label className={labelClasses}>តំណទាញយក (Download URL)</label>
                    <input required type="text" value={formData.downloadUrl || ''} onChange={e => setFormData({...formData, downloadUrl: e.target.value})} className={inputClasses} placeholder="#" />
                  </div>
                </form>
              </div>

              <div className="px-6 py-5 border-t border-white/5 bg-[#0A0C10]/50 flex justify-end gap-3 shrink-0">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 rounded-lg text-sm font-bold text-slate-300 hover:bg-white/5 transition">បោះបង់</button>
                <button type="submit" form="doc-form" className="px-5 py-2.5 rounded-lg text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 transition">
                  {editingDoc ? 'រក្សាទុកការប្រែប្រួល' : 'បញ្ចូលឯកសារ'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Category Editor Modal */}
      <AnimatePresence>
        {isCategoryModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg bg-[#161B22] border-0 sm:border border-white/10 sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col h-full sm:h-auto sm:max-h-[90vh]"
            >
              <div className="px-6 py-5 border-b border-white/5 flex justify-between items-center bg-[#0A0C10]/50 shrink-0">
                <h3 className="text-lg font-bold text-white">{editingCategory ? 'កែប្រែប្រភេទ' : (categoryModalMode === 'subtype' ? 'បញ្ចូលប្រភេទរងថ្មី' : 'បញ្ចូលប្រភេទថ្មី')}</h3>
                <button onClick={() => setIsCategoryModalOpen(false)} className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-white/5 transition"><X size={20}/></button>
              </div>
              
              <div className="p-6 overflow-y-auto flex-1">
                <form id="category-form" onSubmit={handleCategorySubmit} className="flex flex-col gap-5">
                  {!editingCategory && categoryModalMode === 'subtype' ? (
                    <div>
                      <label className={labelClasses}>ជ្រើសរើសប្រភេទ (Category)</label>
                      <select required value={categoryFormData.name || ''} onChange={e => setCategoryFormData({...categoryFormData, name: e.target.value})} className={inputClasses}>
                        <option value="" disabled>ជ្រើសរើសប្រភេទ...</option>
                        {categories.map((c) => (
                           <option key={c.id} value={c.name}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div>
                      <label className={labelClasses}>ឈ្មោះប្រភេទ</label>
                      <input required type="text" value={categoryFormData.name || ''} onChange={e => setCategoryFormData({...categoryFormData, name: e.target.value})} className={inputClasses} placeholder="ឧ. របាយការណ៍" />
                    </div>
                  )}
                  <div>
                    <label className={labelClasses}>ប្រភេទរង (ប្រើសញ្ញាក្បៀស ',' ដើម្បីបំបែក)</label>
                    <textarea rows={3} required={categoryModalMode === 'subtype'} value={categoryFormData.subTypes || ''} onChange={e => setCategoryFormData({...categoryFormData, subTypes: e.target.value})} className={`${inputClasses} resize-none`} placeholder="ឧ. ហិរញ្ញវត្ថុ, ប្រចាំខែ, ប្រចាំឆ្នាំ" />
                  </div>
                </form>
              </div>

              <div className="px-6 py-5 border-t border-white/5 bg-[#0A0C10]/50 flex justify-end gap-3 shrink-0">
                <button type="button" onClick={() => setIsCategoryModalOpen(false)} className="px-5 py-2.5 rounded-lg text-sm font-bold text-slate-300 hover:bg-white/5 transition">បោះបង់</button>
                <button type="submit" form="category-form" className="px-5 py-2.5 rounded-lg text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 transition">
                  {editingCategory ? 'រក្សាទុកការប្រែប្រួល' : (categoryModalMode === 'subtype' ? 'បញ្ចូលប្រភេទរង' : 'បញ្ចូលប្រភេទ')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirm.isOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm bg-[#161B22] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="px-6 py-5 border-b border-white/5 flex justify-between items-center bg-[#0A0C10]/50">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Trash2 className="text-rose-500" size={20} />
                  បញ្ជាក់ការលុប
                </h3>
              </div>
              
              <div className="p-6">
                <p className="text-slate-300">
                  {deleteConfirm.type === 'doc' ? 'តើអ្នកពិតជាចង់លុបឯកសារនេះមែនទេ?' : 
                   deleteConfirm.type === 'category' ? 'តើអ្នកពិតជាចង់លុបប្រភេទនេះមែនទេ?' :
                   `តើអ្នកពិតជាចង់លុបប្រភេទរង "${deleteConfirm.extra}" មែនទេ?`}
                </p>
                <p className="text-slate-500 text-sm mt-2">សកម្មភាពនេះមិនអាចត្រឡប់វិញបានទេ។</p>
              </div>

              <div className="px-6 py-5 border-t border-white/5 bg-[#0A0C10]/50 flex justify-end gap-3">
                <button 
                  onClick={() => setDeleteConfirm({ isOpen: false, type: 'doc', id: '' })} 
                  className="px-5 py-2.5 rounded-lg text-sm font-bold text-slate-300 hover:bg-white/5 transition"
                >
                  បោះបង់
                </button>
                <button 
                  onClick={proceedDelete} 
                  className="px-5 py-2.5 rounded-lg text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 transition"
                >
                  ពិតជាលុប
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Notification Toast */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="fixed bottom-6 right-6 z-[100]"
          >
            <div className={`flex items-center gap-3 px-5 py-3 rounded-lg shadow-xl border ${notification.type === 'success' ? 'bg-[#0A0C10] border-emerald-500/20 text-emerald-400' : 'bg-[#0A0C10] border-rose-500/20 text-rose-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${notification.type === 'success' ? 'bg-emerald-500/10' : 'bg-rose-500/10'}`}>
                {notification.type === 'success' ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                ) : (
                  <X className="w-4 h-4" />
                )}
              </div>
              <span className="font-medium text-sm text-white">{notification.message}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {isLoginModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setIsLoginModalOpen(false)}>
          <div className="bg-[#161B22] p-6 rounded-2xl max-w-sm w-full border border-white/10 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-4 font-['KhmerOSBattambang']">បញ្ចូលអ៊ីមែលចូល</h3>
            <input
              type="email"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              placeholder="អ៊ីមែលរបស់អ្នក..."
              className="w-full bg-[#0A0C10] border border-white/10 rounded-lg px-4 py-2.5 text-white mb-4 placeholder-slate-500"
            />
            <div className="flex gap-2">
              <button onClick={() => setIsLoginModalOpen(false)} className="flex-1 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-medium transition-colors">បោះបង់</button>
              <button onClick={handleLoginSubmit} className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors">ចូល</button>
            </div>
          </div>
        </div>
      )}
      <AnimatePresence>
        {viewingDoc && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black sm:bg-black/90 sm:p-4 lg:p-8"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-black sm:bg-[#0A0C10] w-full h-full sm:max-w-6xl sm:max-h-[90vh] sm:border sm:border-white/10 sm:rounded-2xl overflow-hidden flex flex-col shadow-2xl"
            >
              <div className="flex items-center justify-between p-3 sm:p-4 bg-[#1e2024] sm:bg-[#0A0C10] sm:border-b sm:border-white/10">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <button onClick={() => setViewingDoc(null)} className="text-white hover:bg-white/10 rounded-full p-1.5 -ml-1 flex-shrink-0">
                    <ArrowLeft size={24} />
                  </button>
                  <h2 className="text-lg font-medium text-white truncate">{viewingDoc.title}</h2>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                  <button onClick={() => handleDownload(viewingDoc)} className="text-white hover:bg-white/10 rounded-full p-2 whitespace-nowrap min-w-[40px] text-center flex items-center justify-center font-bold">
                    {downloadingStates[viewingDoc.id] !== undefined ? (
                      <CircularProgress progress={downloadingStates[viewingDoc.id]} size={24} color="text-[#A2CA64]" />
                    ) : (
                      <Download size={22} />
                    )}
                  </button>
                  <button onClick={() => setViewingDoc(null)} className="text-white hover:bg-white/10 rounded-full p-2 flex items-center justify-center">
                    <X size={24} />
                  </button>
                </div>
              </div>
              <div className="flex-1 w-full h-full bg-black relative">
                {isDocLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-[#111317] z-10 text-white font-bold">
                    កំពុងទាញយកសូមរងចាំ...
                  </div>
                )}
                <iframe
                  onLoad={() => setIsDocLoading(false)}
                  src={getDriveEmbedUrl(viewingDoc.downloadUrl || '')}
                  className="w-full h-full border-none"
                  title={viewingDoc.title}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
