import React, { useState, useEffect, useMemo, useDeferredValue } from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Download, File as FileIcon, Search, Eye, EyeOff, HardDriveDownload, Calendar, Plus, Edit2, Trash2, X, LayoutGrid, Settings, Menu, UploadCloud, ChevronDown, Folder, GripVertical, ArrowUp, ArrowDown, LogOut, LogIn, Filter, Check, Loader2, Book, ArrowLeft, Pause, Lock, Phone, MessageCircle, Facebook, Youtube, Play } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { DocumentItem } from './types';
import { collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, query, where, increment } from 'firebase/firestore';
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
  const [deletedFallbackIds, setDeletedFallbackIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('deleted_fallback_videos') || '[]');
    } catch (e) {
      return [];
    }
  });
// Initialize activeTab 'manage' and manageTab 'dashboard' if that's the intended default
  const [activeTab, setActiveTab] = useState<'view' | 'manage' | 'videos'>('view');
  const [manageTab, setManageTab] = useState<'dashboard' | 'docs' | 'videos' | 'types' | 'video_types' | 'admins'>('dashboard');
  const [searchTerm, setSearchTerm] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isManageExpanded, setIsManageExpanded] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState<{type: string, subType: string | null} | null>(null);
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const [viewingDoc, setViewingDoc] = useState<DocumentItem | null>(null);
  const [downloadingStates, setDownloadingStates] = useState<Record<string, number>>({});
  const [isDocLoading, setIsDocLoading] = useState(true);
  const [lockedDocPrompt, setLockedDocPrompt] = useState<DocumentItem | null>(null);
  const [activeYoutubeDoc, setActiveYoutubeDoc] = useState<DocumentItem | null>(null);
  const [showPlaylist, setShowPlaylist] = useState(true);

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
  const [videoCategories, setVideoCategories] = useState<any[]>([]);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [isAdminState, setIsAdminState] = useState(false);
  const [canViewLocked, setCanViewLocked] = useState(false);
  const [selectedVideoSubject, setSelectedVideoSubject] = useState('ទាំងអស់');

  // Video Category Modal State
  const [isVideoCategoryModalOpen, setIsVideoCategoryModalOpen] = useState(false);
  const [editingVideoCategory, setEditingVideoCategory] = useState<any | null>(null);
  const [videoCategoryModalMode, setVideoCategoryModalMode] = useState<'category' | 'subtype'>('category');
  const [videoCategoryFormData, setVideoCategoryFormData] = useState({ name: '', subTypes: '' });

  // Loading & Error State
  const [isLoadingDocs, setIsLoadingDocs] = useState(true);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [isLoadingVideoCategories, setIsLoadingVideoCategories] = useState(true);
  const [quotaError, setQuotaError] = useState(false);
  const isLoading = isLoadingDocs || isLoadingCategories || isLoadingVideoCategories;

  // 1. Dynamics Auth state synchronization
  useEffect(() => {
    let _active = true;
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const u = {
          email: user.email?.toLowerCase() || '',
          displayName: user.displayName || user.email?.toLowerCase().split('@')[0],
          photoURL: user.photoURL || undefined
        };
        setCurrentUser(u);
        
        if (_active) {
          try {
            await setDoc(doc(db, 'users', u.email), {
              email: u.email,
              displayName: u.displayName,
              photoURL: u.photoURL,
              lastLogin: new Date().toISOString()
            }, { merge: true });
          } catch(e) {}
        }
      } else {
        setCurrentUser(null);
      }
    });
    return () => {
      _active = false;
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

  // Video Categories subscription (Always allowed publicly)
  useEffect(() => {
    const unsubscribeVideoCats = onSnapshot(collection(db, 'video_categories'), (snapshot) => {
      const items: any[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        items.push({
          id: doc.id,
          name: data.name,
          subTypes: data.subTypes || []
        });
      });
      setVideoCategories(items);
      setIsLoadingVideoCategories(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'video_categories');
    });
    return () => {
      unsubscribeVideoCats();
    };
  }, []);

  // 3. Users subscription (Only when signed in)
  useEffect(() => {
    if (!currentUser) return;
    
    const emailLower = currentUser.email.toLowerCase();
    const isMaster = emailLower === 'broponleu998@gmail.com' || emailLower === 'mrponleu20000@gmail.com';
    
    if (isMaster) {
      setUsersList([
        { email: 'broponleu998@gmail.com', role: 'master', lastLogin: '' },
        { email: 'mrponleu20000@gmail.com', role: 'master', lastLogin: '' }
      ]);
    }
    
    const unsubscribeUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const items: any[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        items.push({
          email: docSnap.id,
          role: data.role || 'user',
          lastLogin: data.lastLogin || data.addedAt || '',
          displayName: data.displayName || '',
        });
      });
      if (items.length === 0 && isMaster) {
        setUsersList([
           { email: 'broponleu998@gmail.com', role: 'master', lastLogin: '' },
           { email: 'mrponleu20000@gmail.com', role: 'master', lastLogin: '' }
        ]);
      } else {
        setUsersList(items);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });
    return () => {
      unsubscribeUsers();
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
          isFree: data.isFree !== false, // Default to true if missing
          tags: data.tags || [],
          youtubeUrl: data.youtubeUrl || '',
          duration: data.duration || '',
          instructor: data.instructor || '',
          lessonOrder: data.lessonOrder !== undefined ? Number(data.lessonOrder) : undefined
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
        setCanViewLocked(true);
      } else {
        const userRec = usersList.find(a => a.email?.toLowerCase() === emailLower);
        const role = String(userRec?.role || 'user').toLowerCase().trim();
        setIsAdminState(role === 'admin' || role === 'master' || role === 'editor');
        setCanViewLocked(role === 'admin' || role === 'master' || role === 'editor' || role === 'user pro');
      }
    } else {
      setIsAdminState(false);
      setCanViewLocked(false);
    }
  }, [currentUser, usersList]);

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
    let embedUrl = url;
    if (embedUrl.includes('/view')) {
      embedUrl = embedUrl.replace('/view', '/preview');
    } else if (embedUrl.includes('/edit')) {
      embedUrl = embedUrl.replace('/edit', '/preview');
    }
    return embedUrl;
  };

  const getYouTubeEmbedUrl = (url: string) => {
    if (!url) return '';
    const cleanUrl = url.trim();
    
    // Support youtube.com/shorts, youtube.com/live, watch?v= etc.
    const regExp = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/live\/)([^"&?\/\s]{11})/;
    const match = cleanUrl.match(regExp);
    if (match && match[1].length === 11) {
      return `https://www.youtube.com/embed/${match[1]}?autoplay=1&rel=0`;
    }
    
    // If it's a google drive url, support playing its video inside the iframe
    if (cleanUrl.includes('drive.google.com/')) {
      return getDriveEmbedUrl(cleanUrl);
    }
    
    return '';
  };

  const getYouTubeThumbnail = (url: string) => {
    if (!url) return '';
    const cleanUrl = url.trim();
    if (cleanUrl.includes('drive.google.com/')) {
      return getDriveImageUrl(cleanUrl);
    }
    const regExp = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/live\/)([^"&?\/\s]{11})/;
    const match = cleanUrl.match(regExp);
    if (match && match[1].length === 11) {
      return `https://img.youtube.com/vi/${match[1]}/0.jpg`;
    }
    return '';
  };

  const handleView = async (docObj: DocumentItem) => {
    if (docObj.isFree === false && !canViewLocked) {
      setLockedDocPrompt(docObj);
      return;
    }
    setIsDocLoading(true);
    setViewingDoc(docObj);
    try {
      if (!docObj.id.startsWith('v-sample-')) {
        await updateDoc(doc(db, 'docs', docObj.id), {
          downloads: increment(1)
        });
      }
    } catch (e) {
      console.error("Error tracking view count:", e);
    }
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

  // Inline Video Category Management State
  const [newVideoCategoryName, setNewVideoCategoryName] = useState('');
  const [newVideoSubTypeNames, setNewVideoSubTypeNames] = useState<{[key: string]: string}>({});
  const [manageExpandedVideoCategoryIds, setManageExpandedVideoCategoryIds] = useState<string[]>([]);

  const handleInlineAddVideoCategory = async () => {
    if (!newVideoCategoryName.trim()) return;
    try {
      const id = Date.now().toString() + Math.random().toString(36).substring(2, 9);
      await setDoc(doc(db, 'video_categories', id), {
        id,
        name: newVideoCategoryName.trim(),
        subTypes: []
      });
      setNewVideoCategoryName('');
      showNotification('បន្ថែមប្រភេទវីដេអូបានជោគជ័យ');
    } catch (e) {
      console.error(e);
      showNotification('មានបញ្ហាពេលបន្ថែមប្រភេទវីដេអូ', 'error');
    }
  };

  const handleInlineAddVideoSubType = async (categoryId: string) => {
    const subName = newVideoSubTypeNames[categoryId];
    if (!subName || !subName.trim()) return;
    
    const category = videoCategories.find(c => c.id === categoryId);
    if (!category) return;
    
    try {
      const newSubTypes = Array.from(new Set([...category.subTypes, subName.trim()]));
      await updateDoc(doc(db, 'video_categories', categoryId), {
        subTypes: newSubTypes
      });
      setNewVideoSubTypeNames({ ...newVideoSubTypeNames, [categoryId]: '' });
      showNotification('បន្ថែមប្រភេទរងវីដេអូបានជោគជ័យ');
    } catch (e) {
      console.error(e);
      showNotification('មានបញ្ហាពេលបន្ថែមប្រភេទរងវីដេអូ', 'error');
    }
  };

  const handleRemoveVideoSubType = (categoryId: string, subTypeToRemove: string) => {
    setDeleteConfirm({ isOpen: true, type: 'video_subType', id: categoryId, extra: subTypeToRemove });
  };

  const toggleManageVideoCategoryExpansion = (categoryId: string) => {
    setManageExpandedVideoCategoryIds(prev => 
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
      if ((activeTab === 'view' || activeTab === 'videos') && doc.isHidden && !isAdminState) return false;
      
      // Do not show videos in the documents view tab
      if (activeTab === 'view' && (doc.youtubeUrl || doc.fileType === 'YouTube' || doc.fileSize === 'Video')) return false;

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
  }, [docs, deferredSearchTerm, typeFilter, activeTab, isAdminState]);

  const allVideoDocs = useMemo(() => {
    return docs.filter(doc => !!doc.youtubeUrl);
  }, [docs]);

  const videoDocs = useMemo(() => {
    return allVideoDocs.filter(doc => {
      if (doc.isHidden && !isAdminState) return false;
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
  }, [allVideoDocs, deferredSearchTerm, typeFilter, isAdminState]);

  const videoSubjects = useMemo(() => {
    const types = new Set<string>();
    allVideoDocs.forEach(d => { if (d.type) types.add(d.type); });
    return ['ទាំងអស់', ...Array.from(types).sort((a, b) => a.localeCompare(b, 'km'))];
  }, [allVideoDocs]);

  const displayVideos = useMemo(() => {
    return videoDocs.filter(doc => {
      if (selectedVideoSubject === 'ទាំងអស់') return true;
      return doc.type === selectedVideoSubject;
    });
  }, [videoDocs, selectedVideoSubject]);

  const groupedVideos = useMemo(() => {
    const groups: { [key: string]: DocumentItem[] } = {};
    displayVideos.forEach(vid => {
      const chapter = vid.type || 'ផ្សេងៗ';
      if (!groups[chapter]) {
        groups[chapter] = [];
      }
      groups[chapter].push(vid);
    });
    
    return Object.keys(groups).sort((a, b) => {
      if (a === 'ផ្សេងៗ') return 1;
      if (b === 'ផ្សេងៗ') return -1;
      return a.localeCompare(b, 'km');
    }).map(chapter => ({
      chapter,
      videos: groups[chapter].sort((a, b) => {
        const orderA = a.lessonOrder !== undefined ? a.lessonOrder : 999;
        const orderB = b.lessonOrder !== undefined ? b.lessonOrder : 999;
        return orderA - orderB;
      })
    }));
  }, [displayVideos]);

  const featuredVideo = useMemo(() => {
    if (displayVideos.length === 0) return null;
    // Find the first free video as a showcase highlight, or just fallback to the first
    const freeVid = displayVideos.find(v => v.isFree !== false);
    return freeVid || displayVideos[0];
  }, [displayVideos]);

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
      isFree: true,
      tags: [],
      youtubeUrl: '',
      duration: '',
      instructor: '',
      lessonOrder: undefined
    });
    setIsModalOpen(true);
  };

  const openEditModal = (doc: DocumentItem) => {
    setEditingDoc(doc);
    setTagsInput(doc.tags ? doc.tags.join(', ') : '');
    setFormData(doc);
    setIsModalOpen(true);
  };

  const [deleteConfirm, setDeleteConfirm] = useState<{isOpen: boolean, type: 'doc' | 'category' | 'subType' | 'video_category' | 'video_subType', id: string, extra?: string}>({isOpen: false, type: 'doc', id: ''});

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

  const openAddVideoCategoryModal = () => {
    setEditingVideoCategory(null);
    setVideoCategoryModalMode('category');
    setVideoCategoryFormData({ name: '', subTypes: '' });
    setIsVideoCategoryModalOpen(true);
  };

  const openAddVideoSubTypeModal = () => {
    setEditingVideoCategory(null);
    setVideoCategoryModalMode('subtype');
    setVideoCategoryFormData({ name: videoCategories.length > 0 ? videoCategories[0].name : '', subTypes: '' });
    setIsVideoCategoryModalOpen(true);
  };

  const openEditVideoCategoryModal = (category: any) => {
    setEditingVideoCategory(category);
    setVideoCategoryModalMode('category');
    setVideoCategoryFormData({ name: category.name, subTypes: category.subTypes.join(', ') });
    setIsVideoCategoryModalOpen(true);
  };

  const handleDeleteVideoCategory = (id: string) => {
    setDeleteConfirm({ isOpen: true, type: 'video_category', id });
  };

  const proceedDelete = async () => {
    try {
      if (deleteConfirm.type === 'doc') {
        if (deleteConfirm.id.startsWith('v-sample-')) {
          const updated = [...deletedFallbackIds, deleteConfirm.id];
          setDeletedFallbackIds(updated);
          localStorage.setItem('deleted_fallback_videos', JSON.stringify(updated));
        } else {
          await deleteDoc(doc(db, 'docs', deleteConfirm.id));
        }
      } else if (deleteConfirm.type === 'category') {
        await deleteDoc(doc(db, 'categories', deleteConfirm.id));
      } else if (deleteConfirm.type === 'video_category') {
        await deleteDoc(doc(db, 'video_categories', deleteConfirm.id));
      } else if (deleteConfirm.type === 'subType' && deleteConfirm.extra) {
        const category = categories.find(c => c.id === deleteConfirm.id);
        if (category) {
          await updateDoc(doc(db, 'categories', deleteConfirm.id), {
            subTypes: category.subTypes.filter((s: string) => s !== deleteConfirm.extra)
          });
        }
      } else if (deleteConfirm.type === 'video_subType' && deleteConfirm.extra) {
        const category = videoCategories.find(c => c.id === deleteConfirm.id);
        if (category) {
          await updateDoc(doc(db, 'video_categories', deleteConfirm.id), {
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

  const handleVideoCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const subs = videoCategoryFormData.subTypes.split(',').map(s => s.trim()).filter(s => s);
    try {
      if (editingVideoCategory) {
        await updateDoc(doc(db, 'video_categories', editingVideoCategory.id), {
          name: videoCategoryFormData.name,
          subTypes: subs
        });
      } else {
        if (videoCategoryModalMode === 'subtype') {
          const category = videoCategories.find(c => c.name === videoCategoryFormData.name);
          if (category) {
            const newSubtypes = Array.from(new Set([...category.subTypes, ...subs]));
            await updateDoc(doc(db, 'video_categories', category.id), {
              subTypes: newSubtypes
            });
          }
        } else {
          const id = Date.now().toString() + Math.random().toString(36).substring(2, 9);
          await setDoc(doc(db, 'video_categories', id), {
            id,
            name: videoCategoryFormData.name,
            subTypes: subs
          });
        }
      }
      setIsVideoCategoryModalOpen(false);
      showNotification('រក្សាទុកប្រភេទវីដេអូបានជោគជ័យ');
    } catch (e) {
      console.error(e);
      showNotification('មានបញ្ហាពេលរក្សាទុកប្រភេទវីដេអូ', 'error');
    }
  };

  const handlePlayVideo = async (docObj: DocumentItem) => {
    if (docObj.isFree === false && !canViewLocked) {
      setLockedDocPrompt(docObj);
      return;
    }
    setActiveYoutubeDoc(docObj);
    try {
      if (!docObj.id.startsWith('v-sample-')) {
        await updateDoc(doc(db, 'docs', docObj.id), {
          downloads: increment(1)
        });
      }
    } catch (e) {
      console.error("Error tracking view count:", e);
    }
  };

  const handleDownload = async (docObj: DocumentItem) => {
    if (docObj.isFree === false && !canViewLocked) {
      setLockedDocPrompt(docObj);
      return;
    }
    if (downloadingStates[docObj.id] !== undefined) return;

    setDownloadingStates(prev => ({ ...prev, [docObj.id]: 0 }));
    
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.floor(Math.random() * 15) + 5;
      if (progress > 90) progress = 90;
      setDownloadingStates(prev => ({ ...prev, [docObj.id]: progress }));
    }, 200);

    setTimeout(async () => {
      clearInterval(interval);
      setDownloadingStates(prev => ({ ...prev, [docObj.id]: 100 }));
      
      if (docObj.downloadUrl) {
        let downloadUrl = docObj.downloadUrl;
        if (downloadUrl.includes('drive.google.com/')) {
          const regex = /\/d\/([a-zA-Z0-9_-]+)/;
          const match = downloadUrl.match(regex);
          if (match && match[1]) {
            downloadUrl = `https://drive.google.com/uc?export=download&id=${match[1]}`;
          }
        }
        
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.target = '_blank';
        link.download = docObj.title || 'download';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      
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
      }, 1000);
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

      // Auto thumbnail extraction from YouTube
      if (!finalData.coverUrl && finalData.youtubeUrl) {
        finalData.coverUrl = getYouTubeThumbnail(finalData.youtubeUrl);
      }

      // Default blank downloadUrl to youtubeUrl or '#' to satisfy rules schema
      const downloadLinkVal = finalData.downloadUrl && finalData.downloadUrl.trim() !== '' 
        ? finalData.downloadUrl 
        : (finalData.youtubeUrl || '#');
      
      const details = {
        title: finalData.title || '',
        description: finalData.description || '',
        coverUrl: finalData.coverUrl || '',
        fileSize: finalData.fileSize || ((activeTab === 'videos' || (activeTab === 'manage' && manageTab === 'videos')) ? 'Video' : ''),
        fileType: finalData.fileType || ((activeTab === 'videos' || (activeTab === 'manage' && manageTab === 'videos')) ? 'YouTube' : ''),
        downloadUrl: downloadLinkVal,
        uploadDate: finalData.uploadDate || new Date().toISOString().split('T')[0],
        downloads: Number(finalData.downloads || 0),
        type: finalData.type || '',
        subType: finalData.subType || '',
        isHidden: !!finalData.isHidden,
        isFree: finalData.isFree !== false,
        tags: finalData.tags || [],
        youtubeUrl: finalData.youtubeUrl || '',
        duration: finalData.duration || '',
        instructor: finalData.instructor || '',
        lessonOrder: finalData.lessonOrder !== undefined ? Number(finalData.lessonOrder) : 0
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
            <img src="/icon.ico" alt="Logo" className="w-14 h-14 drop-shadow-lg rounded-lg object-contain" />
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

          <button
            onClick={() => { setActiveTab('videos'); setIsSidebarOpen(false); setSearchTerm(''); }}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition-colors ${activeTab === 'videos' ? 'bg-blue-600/10 text-blue-500' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
          >
            <Youtube size={18}/> វីដេអូមេរៀន
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
                        onClick={() => { setActiveTab('manage'); setManageTab('videos'); setIsSidebarOpen(false); }}
                        className={`text-left text-sm py-2 px-3 rounded-md transition-colors ${activeTab === 'manage' && manageTab === 'videos' ? 'bg-blue-600/20 text-blue-400 font-semibold' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}
                      >
                        គ្រប់គ្រងវីដេអូ
                      </button>
                      <button
                        onClick={() => { setActiveTab('manage'); setManageTab('types'); setIsSidebarOpen(false); }}
                        className={`text-left text-sm py-2 px-3 rounded-md transition-colors ${activeTab === 'manage' && manageTab === 'types' ? 'bg-blue-600/20 text-blue-400 font-semibold' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}
                      >
                        ប្រភេទឯកសារ
                      </button>
                      <button
                        onClick={() => { setActiveTab('manage'); setManageTab('video_types'); setIsSidebarOpen(false); }}
                        className={`text-left text-sm py-2 px-3 rounded-md transition-colors ${activeTab === 'manage' && manageTab === 'video_types' ? 'bg-blue-600/20 text-blue-400 font-semibold' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}
                      >
                        ប្រភេទវីដេអូ
                      </button>
                      <button
                        onClick={() => { setActiveTab('manage'); setManageTab('admins'); setIsSidebarOpen(false); }}
                        className={`text-left text-sm py-2 px-3 rounded-md transition-colors ${activeTab === 'manage' && manageTab === 'admins' ? 'bg-blue-600/20 text-blue-400 font-semibold' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}
                      >
                        អ្នកប្រើប្រាស់ និងសិទ្ធិ
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
              onClick={() => setIsLoginModalOpen(true)} 
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
                                if (activeTab === 'videos') {
                                  setActiveTab('videos');
                                } else {
                                  setActiveTab('view');
                                }
                                setSearchTerm('');
                              }}
                            >
                              <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${!typeFilter ? 'border-blue-500' : 'border-slate-500'}`}>
                                {!typeFilter && <div className="w-2 h-2 rounded-full bg-blue-500"></div>}
                              </div>
                              <span className={!typeFilter ? "text-white font-medium" : "text-slate-300"}>
                                {activeTab === 'videos' ? 'វីដេអូទាំងអស់' : 'ឯកសារទាំងអស់'}
                              </span>
                            </div>
                            
                            {(activeTab === 'videos' ? videoCategories : categories).map((c) => (
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
                                      if (activeTab === 'videos') {
                                        setActiveTab('videos');
                                      } else {
                                        setActiveTab('view');
                                      }
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
                                          if (activeTab === 'videos') {
                                            setActiveTab('videos');
                                          } else {
                                            setActiveTab('view');
                                          }
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
        {((activeTab === 'manage' && isAdminUser) || ((activeTab === 'view' || activeTab === 'videos') && typeFilter) || activeTab === 'videos') && (
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 max-w-full">
            <div className="max-w-2xl">
              {activeTab === 'manage' && (
                <>
                  <h2 className="text-2xl font-extrabold text-white mb-3 leading-tight uppercase tracking-tight">
                    {manageTab === 'docs' ? 'គ្រប់គ្រងឯកសារ' : manageTab === 'videos' ? 'គ្រប់គ្រងវីដេអូ' : manageTab === 'types' ? 'ប្រភេទឯកសារ' : manageTab === 'video_types' ? 'ប្រភេទវីដេអូ' : manageTab === 'dashboard' ? 'ផ្ទាំងរបាយការណ៍សង្ខេប' : 'គ្រប់គ្រងសិទ្ធិជាន់ខ្ពស់'}
                  </h2>
                  <p className="text-slate-400 text-base">
                    {manageTab === 'docs' ? 'បញ្ចូល កែប្រែ ឬលុបឯកសារចេញពីប្រព័ន្ធកណ្តាលរបស់អ្នក។' : manageTab === 'videos' ? 'បញ្ចូល កែប្រែ ឬលុបវីដេអូចេញពីប្រព័ន្ធកណ្តាលរបស់អ្នក។' : manageTab === 'types' ? 'បង្ហាញ ឬបង្កើតប្រភេទឯកសារថ្មីៗ និងប្រភេទរងរបស់វា។' : manageTab === 'video_types' ? 'បង្ហាញ ឬបង្កើតប្រភេទវីដេអូថ្មីៗ និងប្រភេទរងរបស់វា។' : manageTab === 'dashboard' ? 'មើលទិន្នន័យរួម និងចំណាត់ថ្នាក់ឯកសារ។' : 'បន្ថែមឫដកសិទ្ធិគណនីរបស់អ្នកផ្សេងឲ្យធ្វើជា Admin។'}
                  </p>
                </>
              )}
              {activeTab === 'videos' && (
                <>
                  <h2 className="text-2xl font-extrabold text-white mb-3 leading-tight uppercase tracking-tight">
                    {typeFilter ? (typeFilter.subType ? `${typeFilter.type} - ${typeFilter.subType}` : typeFilter.type) : 'វីដេអូមេរៀនទាំងអស់'}
                  </h2>
                  <p className="text-slate-400 text-base">
                    រៀនសូត្រតាមរយៈវីដេអូបង្រៀនលម្អិតជាមួយការបកស្រាយក្បោះក្បាយពីលោកគ្រូ អ្នកគ្រូ។
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
                {manageTab === 'videos' && (
                  <button
                    onClick={openAddModal}
                    className="px-5 py-3 sm:py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl sm:rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-colors shadow-sm whitespace-nowrap w-full sm:w-auto"
                  >
                    <Plus size={18} />
                    បញ្ចូលវីដេអូថ្មី
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <div className="mt-6">
          {activeTab === 'manage' && isAdminUser && manageTab === 'video_types' ? (
            <div className="flex flex-col gap-6 max-w-3xl pb-12">
              {/* Add New Video Category Card */}
              <div className="bg-[#161B22] border border-white/5 rounded-2xl p-6">
                <div className="flex flex-col gap-4">
                  <input 
                    type="text" 
                    value={newVideoCategoryName}
                    onChange={(e) => setNewVideoCategoryName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleInlineAddVideoCategory()}
                    placeholder="បញ្ចូលប្រភេទវីដេអូថ្មី" 
                    className="w-full bg-[#0A0C10] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                  <button 
                    onClick={handleInlineAddVideoCategory}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 text-sm transition-colors"
                  >
                    <Plus size={18} /> បន្ថែមប្រភេទវីដេអូ
                  </button>
                </div>
              </div>

              {/* Video Category List */}
              <div className="flex flex-col gap-4">
                {videoCategories.length === 0 ? (
                  <div className="text-center py-8 text-[#E2E8F0] italic rounded-2xl bg-[#161B22] border border-white/5">គ្មានប្រភេទវីដេអូទេ (No video categories)</div>
                ) : (
                  videoCategories.map((category) => {
                    const isExpanded = manageExpandedVideoCategoryIds.includes(category.id);
                    return (
                      <div key={category.id} className="bg-[#161B22] border border-white/5 rounded-2xl overflow-hidden flex flex-col">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 bg-[#161B22] gap-3">
                          <div className="flex items-center gap-2 sm:gap-4 flex-1 cursor-pointer min-w-0" onClick={() => toggleManageVideoCategoryExpansion(category.id)}>
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
                                onClick={(e) => { e.stopPropagation(); openEditVideoCategoryModal(category); }}
                                className="p-2.5 sm:p-2 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 rounded transition-colors"
                              >
                                <Edit2 size={16} className="sm:w-4 sm:h-4 w-5 h-5" />
                              </button>
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleDeleteVideoCategory(category.id); }}
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
                                      <div key={sub} className="flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full pl-4 text-sm text-slate-300">
                                        <span>{sub}</span>
                                        <button onClick={() => handleRemoveVideoSubType(category.id, sub)} className="text-slate-500 hover:text-red-400 hover:bg-white/5 rounded-full p-1 transition-colors ml-1">
                                          <X size={14} />
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {/* Inline Add Sub-Type */}
                                <div className="flex gap-2 max-w-md mt-2">
                                  <input 
                                    type="text" 
                                    value={newVideoSubTypeNames[category.id] || ''}
                                    onChange={(e) => setNewVideoSubTypeNames({ ...newVideoSubTypeNames, [category.id]: e.target.value })}
                                    onKeyDown={(e) => e.key === 'Enter' && handleInlineAddVideoSubType(category.id)}
                                    placeholder="បញ្ចូលប្រភេទរងថ្មី..." 
                                    className="flex-1 bg-[#0A0C10] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                                  />
                                  <button 
                                    onClick={() => handleInlineAddVideoSubType(category.id)}
                                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                                  >
                                    <Plus size={12} /> បន្ថែម
                                  </button>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ) : activeTab === 'manage' && isAdminUser && manageTab === 'types' ? (
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

                              {/* Inline Add Sub-Type */}
                              <div className="flex gap-2 max-w-md mt-2">
                                <input 
                                  type="text" 
                                  value={newSubTypeNames[category.id] || ''}
                                  onChange={(e) => setNewSubTypeNames({ ...newSubTypeNames, [category.id]: e.target.value })}
                                  onKeyDown={(e) => e.key === 'Enter' && handleInlineAddSubType(category.id)}
                                  placeholder="បញ្ចូលប្រភេទរងថ្មី..." 
                                  className="flex-1 bg-[#0A0C10] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                                />
                                <button 
                                  onClick={() => handleInlineAddSubType(category.id)}
                                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                                >
                                  <Plus size={12} /> បន្ថែម
                                </button>
                              </div>
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
        ) : activeTab === 'videos' ? (
          <div className="flex flex-col gap-8 pb-10">
            {/* Structured Chapters / Subtypes Grouping section */}
            <div className="flex flex-col gap-10">
              {displayVideos.length === 0 ? (
                <div className="text-center py-20 bg-[#161B22] border border-white/5 rounded-2xl">
                  <Youtube className="mx-auto h-12 w-12 text-slate-500 mb-4 animate-pulse" />
                  <h3 className="text-lg font-bold text-white">គ្មានវីដេអូមេរៀនទេ</h3>
                  <p className="mt-2 text-sm text-slate-400 max-w-sm mx-auto">
                    មិនទាន់មានវីដេអូមេរៀនណាមួយត្រូវបានបញ្ចូល ឬស៊ីគ្នាជាមួយការស្វែងរកឡើយ។
                  </p>
                </div>
              ) : (
                groupedVideos.map(({ chapter, videos }) => (
                  <div key={chapter} className="flex flex-col gap-5">
                    {/* Chapter title header */}
                    <div className="flex items-center justify-between border-b border-white/5 pb-3">
                      <h3 className="text-base md:text-lg font-extrabold text-white flex items-center gap-2">
                        <Folder className="text-blue-500" size={20} />
                        {chapter}
                        <span className="text-[11px] font-bold text-slate-400 bg-white/5 px-2 py-0.5 rounded-full border border-white/5 ml-2">
                          {videos.length} វីដេអូ
                        </span>
                      </h3>
                    </div>

                    {/* Lesson grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                      {videos.map((vid, idx) => (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.98, y: 15 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          transition={{ duration: 0.35, delay: idx * 0.04 }}
                          key={vid.id}
                          className="group bg-[#161B22] border border-white/5 rounded-2xl overflow-hidden hover:border-red-500/40 transition-all flex flex-col relative shadow-md"
                        >
                          {/* Thumbnail */}
                          <div 
                            className="relative h-40 w-full bg-[#0A0C10] overflow-hidden cursor-pointer"
                            onClick={() => handlePlayVideo(vid)}
                          >
                            <img
                              src={vid.coverUrl ? getDriveImageUrl(vid.coverUrl) : getYouTubeThumbnail(vid.youtubeUrl)}
                              alt={vid.title}
                              loading="lazy"
                              className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-in-out"
                            />
                            {/* Play Overlay */}
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
                              <div className="w-11 h-11 rounded-full bg-red-600 flex items-center justify-center text-white shadow-lg transform group-hover:scale-110 transition-transform">
                                <Play fill="currentColor" size={20} className="ml-0.5" />
                              </div>
                            </div>

                            {/* Paid/Free Badge */}
                            <div className="absolute top-3 right-3 z-30">
                              {vid.isFree === false && (
                                <div className="p-1.5 bg-black/60 text-amber-400 rounded-lg shadow-sm border border-white/10 backdrop-blur-md" title="Paid Level">
                                  <Lock size={12} className="stroke-[2.5]" />
                                </div>
                              )}
                            </div>

                            {/* Duration Indicator */}
                            {vid.duration && (
                              <div className="absolute bottom-3 right-3 z-20 bg-black/75 text-white test-[10px] px-1.5 py-0.5 rounded font-mono font-semibold tracking-wide border border-white/5">
                                {vid.duration}
                              </div>
                            )}

                            {/* Category Label */}
                            <div className="absolute bottom-3 left-3 z-20 bg-black/60 px-2 py-0.5 rounded text-[10px] font-extrabold tracking-wide text-red-500 border border-red-500/10 flex items-center gap-1">
                              <Youtube size={12} /> {vid.type || 'VIDEO'}
                            </div>

                            <div className="absolute inset-0 bg-gradient-to-t from-[#161B22] via-transparent to-transparent opacity-60 z-10 pointer-events-none" />
                          </div>

                          {/* Detail block */}
                          <div className="p-4 flex-1 flex flex-col">
                            {vid.description && (
                              <p className="text-slate-400 text-xs line-clamp-2 mb-2 leading-relaxed">
                                {vid.description}
                              </p>
                            )}

                            <div className="flex-1"></div>

                            {/* Teacher avatar and actions */}
                            <div className="border-t border-white/5 pt-3 flex items-center justify-between mt-auto gap-2">
                              <h3 
                                onClick={() => handlePlayVideo(vid)}
                                className="text-[14px] font-extrabold text-white leading-normal line-clamp-1 hover:text-[#FF3E3E] cursor-pointer transition-colors"
                                title={vid.title}
                              >
                                {vid.title}
                              </h3>
                              <div className="flex items-center gap-1 shrink-0 text-slate-500 text-xs font-bold">
                                <Eye size={12} /> {(vid.downloads || 0).toLocaleString('km-KH')}
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : activeTab === 'view' ? (
          <div className="flex flex-col gap-12">
            {groupedDocs.map((group) => (
              <div key={group.type}>
                <div className="flex items-center gap-3 mb-6">
                  <Folder className="text-blue-500" size={24} />
                  <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight">{group.type}</h2>
                  <span className="text-xs font-bold px-2.5 py-1 bg-[#161B22] text-slate-400 rounded-full border border-white/5 shadow-sm">
                    {group.docs.length} ឯកសារ
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {group.docs.map((doc, index) => (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, margin: "-50px" }}
                      key={doc.id}
                      className="group bg-[#161B22] border border-white/5 hover:border-blue-500/30 rounded-2xl overflow-hidden flex flex-col shadow-lg hover:shadow-blue-900/10 transition-all duration-300 transform hover:-translate-y-1"
                    >
                      {/* Cover Image */}
                      <div 
                        className="relative h-40 w-full bg-[#0A0C10] overflow-hidden cursor-pointer"
                        onClick={() => handleView(doc)}
                      >
                        <img
                          src={doc.coverUrl ? getDriveImageUrl(doc.coverUrl) : ''}
                          alt={doc.title}
                          loading="lazy"
                          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-in-out"
                        />
                        {/* Open Overlay */}
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
                          <div className="w-11 h-11 rounded-full bg-blue-600 flex items-center justify-center text-white shadow-lg transform group-hover:scale-110 transition-transform">
                            <Eye fill="currentColor" size={20} />
                          </div>
                        </div>

                        {/* Paid/Free Badge */}
                        <div className="absolute top-3 right-3 z-30">
                          {doc.isFree === false && (
                            <div className="p-1.5 bg-black/60 text-amber-400 rounded-lg shadow-sm border border-white/10 backdrop-blur-md" title="Paid Level">
                              <Lock size={12} className="stroke-[2.5]" />
                            </div>
                          )}
                        </div>

                        {/* File Size or Duration Indicator */}
                        {(doc.fileSize || doc.duration) && (
                          <div className="absolute bottom-3 right-3 z-20 bg-black/75 text-white test-[10px] px-1.5 py-0.5 rounded font-mono font-semibold tracking-wide border border-white/5 text-xs">
                            {doc.duration || doc.fileSize}
                          </div>
                        )}

                        {/* Category Label */}
                        <div className="absolute bottom-3 left-3 z-20 bg-black/60 px-2 py-0.5 rounded text-[10px] font-extrabold tracking-wide text-blue-500 border border-blue-500/10 flex items-center gap-1">
                           <Folder className="w-3 h-3" /> <span className="max-w-[120px] truncate">{doc.subType || doc.type || 'ឯកសារ'}</span>
                        </div>

                        <div className="absolute inset-0 bg-gradient-to-t from-[#161B22] via-transparent to-transparent opacity-60 z-10 pointer-events-none" />
                      </div>

                      {/* Content */}
                      <div className="p-4 flex-1 flex flex-col">
                        {doc.description && (
                          <p className="text-slate-400 text-xs line-clamp-2 mb-2 leading-relaxed">
                            {doc.description}
                          </p>
                        )}

                        <div className="flex-1"></div>
                        
                        {/* Instructor and Actions */}
                        <div className="border-t border-white/5 pt-3 flex items-center justify-between mt-auto gap-2">
                           <h3 
                             onClick={() => handleView(doc)}
                             className="text-[14px] font-extrabold text-white leading-normal line-clamp-1 hover:text-[#3B82F6] cursor-pointer transition-colors"
                             title={doc.title}
                           >
                             {doc.title}
                           </h3>
                           <div className="flex items-center gap-2 shrink-0">
                              <div className="text-slate-500 text-xs font-bold mr-1">
                                <Eye size={12} className="inline mr-0.5"/> {(doc.downloads || 0).toLocaleString('km-KH')}
                              </div>
                              {doc.youtubeUrl && (
                                <button
                                  onClick={() => handlePlayVideo(doc)}
                                  className="text-red-500 hover:text-red-400 font-bold text-xs p-1 flex items-center gap-1"
                                >
                                  <Youtube size={14} /> វីដេអូ
                                </button>
                              )}
                              <button
                                onClick={() => handleDownload(doc)}
                                className="text-emerald-500 hover:text-emerald-400 font-bold text-xs p-1 flex items-center gap-1 ml-1"
                              >
                                {downloadingStates[doc.id] !== undefined ? (
                                  <CircularProgress progress={downloadingStates[doc.id]} size={14} />
                                ) : (
                                  <><Download size={14} /> ទាញយក</>
                                )}
                              </button>
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
                  {filteredDocs.filter(d => !d.youtubeUrl).map(doc => (
                    <tr key={doc.id} className={`border-b border-white/5 transition ${doc.isHidden ? 'bg-black/60 opacity-60 hover:bg-black/40' : 'hover:bg-white/[0.02]'}`}>
                      <td className="p-4 pl-6">
                        <div className="flex items-center gap-4">
                          <div className="w-14 h-14 rounded-lg bg-[#0A0C10] overflow-hidden shrink-0 relative border border-white/5">
                            <img src={getDriveImageUrl(doc.coverUrl)} alt="" loading="lazy" className="w-full h-full object-cover" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <div className="text-white font-bold text-sm leading-[1.6] py-1 line-clamp-2">{doc.title}</div>
                              {doc.isFree === false && (
                                <span className="px-1.5 py-0.5 text-[10px] font-bold bg-amber-500/10 text-amber-500 rounded flex items-center justify-center shrink-0" title="បង់ប្រាក់"><Lock size={12} className="stroke-[2.5]" /></span>
                              )}
                              {doc.youtubeUrl && (
                                <span className="px-1.5 py-0.5 text-[10px] font-bold bg-red-500/10 text-red-500 rounded flex items-center justify-center shrink-0 gap-1" title="មានវីដេអូ YouTube"><Youtube size={10} /> YouTube</span>
                              )}
                            </div>
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
        ) : activeTab === 'manage' && isAdminUser && manageTab === 'videos' ? (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#161B22] border border-white/5 rounded-2xl overflow-hidden shadow-lg"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[700px]">
                <thead>
                  <tr className="border-b border-white/5 text-slate-400 text-xs uppercase tracking-wider bg-[#0A0C10]/50">
                    <th className="p-4 pl-6 font-medium">វីដេអូ</th>
                    <th className="p-4 font-medium w-40">ប្រភេទ</th>
                    <th className="p-4 font-medium w-32">ទស្សនា</th>
                    <th className="p-4 pr-6 font-medium text-right w-32">សកម្មភាព</th>
                  </tr>
                </thead>
                <tbody>
                  {videoDocs.map(doc => (
                    <tr key={doc.id} className={`border-b border-white/5 transition ${doc.isHidden ? 'bg-black/60 opacity-60 hover:bg-black/40' : 'hover:bg-white/[0.02]'}`}>
                      <td className="p-4 pl-6">
                        <div className="flex items-center gap-4">
                          <div className="w-20 h-14 rounded-lg bg-[#0A0C10] overflow-hidden shrink-0 relative border border-white/5">
                            <img src={doc.coverUrl ? getDriveImageUrl(doc.coverUrl) : getYouTubeThumbnail(doc.youtubeUrl)} alt="" loading="lazy" className="w-full h-full object-cover" />
                            {doc.duration && (
                              <div className="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] font-bold px-1 rounded">{doc.duration}</div>
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <div className="text-white font-bold text-sm leading-[1.6] py-1 line-clamp-2">{doc.title}</div>
                              {doc.isFree === false && (
                                <span className="px-1.5 py-0.5 text-[10px] font-bold bg-amber-500/10 text-amber-500 rounded flex items-center justify-center shrink-0" title="បង់ប្រាក់"><Lock size={12} className="stroke-[2.5]" /></span>
                              )}
                            </div>
                            {doc.tags && doc.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {doc.tags.map((tag, idx) => (
                                  <span key={idx} className="text-[10px] bg-red-500/10 text-red-400 font-medium px-2 py-0.5 rounded-md">{tag}</span>
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
                        <div className="flex items-center gap-1.5" title="ចំនួនអ្នកទស្សនា/ទាញយក">
                          <Eye size={14} />
                          {doc.downloads?.toLocaleString('km-KH') || 0}
                        </div>
                      </td>
                      <td className="p-4 pr-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button 
                            onClick={() => handleToggleHide(doc)} 
                            className={`p-2 rounded-lg transition ${doc.isHidden ? 'text-red-500 bg-red-500/10' : 'text-slate-400 hover:text-red-500 hover:bg-red-500/10'}`}
                            title={doc.isHidden ? "បង្ហាញវីដេអូ" : "លាក់វីដេអូ"}
                          >
                            {doc.isHidden ? <EyeOff size={16}/> : <Eye size={16}/>}
                          </button>
                          <button 
                            onClick={() => openEditModal(doc)} 
                            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition"
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
                    placeholder="បញ្ចូល Email អ្នកប្រើប្រាស់..." 
                    className="flex-1 bg-[#0A0C10] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter') {
                        const email = newAdminEmail.trim().toLowerCase();
                        if (email && email.includes('@')) {
                          try {
                            if (editingAdminEmail && editingAdminEmail !== email) {
                              await deleteDoc(doc(db, 'users', editingAdminEmail));
                            }
                            await setDoc(doc(db, 'users', email), {
                              email,
                              role: newAdminRole,
                              addedAt: new Date().toISOString()
                            }, { merge: true });
                            
                            setNewAdminEmail('');
                            setEditingAdminEmail(null);
                            setNewAdminRole('user');
                            showNotification(editingAdminEmail ? 'បានកែប្រែសិទ្ធិដោយជោគជ័យ' : 'បានបញ្ចួលអ្នកប្រើប្រាស់ជោគជ័យ');
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
                    <option value="user">User ធម្មតា</option>
                    <option value="user pro">User Pro (មើលបានឯកសារជាប់សោរ)</option>
                    <option value="editor">Editor (ត្រឹមបញ្ចូល/កែប្រែ)</option>
                    <option value="admin">Admin ពេញសិទ្ធិ</option>
                  </select>
                </div>
                
                <div className="flex gap-3">
                  {editingAdminEmail && (
                    <button 
                      onClick={() => {
                        setEditingAdminEmail(null);
                        setNewAdminEmail('');
                        setNewAdminRole('user');
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
                            await deleteDoc(doc(db, 'users', editingAdminEmail));
                          }
                          await setDoc(doc(db, 'users', email), {
                            email,
                            role: newAdminRole,
                            addedAt: new Date().toISOString()
                          }, { merge: true });
                          setNewAdminEmail('');
                          setEditingAdminEmail(null);
                          setNewAdminRole('user');
                          showNotification(editingAdminEmail ? 'បានកែប្រែសិទ្ធិដោយជោគជ័យ' : 'បានបញ្ចួលអ្នកប្រើប្រាស់ជោគជ័យ');
                        } catch (err) {
                          showNotification('គ្មានសិទ្ធិ ឬមានបញ្ហា', 'error');
                        }
                      }
                    }}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 text-sm transition-colors"
                  >
                    {editingAdminEmail ? <><Check size={18} /> រក្សាទុកកែប្រែ</> : <><Plus size={18} /> កំណត់មុខងារសិទ្ធិ</>}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <h3 className="text-slate-400 font-bold uppercase tracking-wider text-sm pl-2 mt-4">បញ្ជីអ្នកប្រើប្រាស់ (USERS)</h3>
              {usersList.length === 0 && <div className="text-slate-600 pl-2 text-sm">មិនទាន់មានអ្នកប្រើប្រាស់ទេ...</div>}
              {usersList.map((ad) => (
                <div key={ad.email} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-[#161B22] border border-white/5 rounded-xl group hover:border-white/10 transition-colors gap-3">
                  <div className="flex flex-col">
                    <div className="text-slate-200 font-bold flex items-center gap-2">
                       {ad.email}
                       {ad.role === 'master' && <span className="text-[10px] bg-teal-500/10 text-teal-500 px-2 py-0.5 rounded font-bold uppercase">Master</span>}
                       {ad.role === 'admin' && <span className="text-[10px] bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded font-bold uppercase">Admin</span>}
                       {ad.role === 'editor' && <span className="text-[10px] bg-amber-500/10 text-amber-500 px-2 py-0.5 rounded font-bold uppercase">Editor</span>}
                       {ad.role === 'user pro' && <span className="text-[10px] bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded font-bold uppercase">Pro</span>}
                    </div>
                    <div className="text-slate-500 text-xs mt-1 font-medium flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-500 inline-block"></span>
                      {ad.role?.toUpperCase() || 'USER'}
                      {(ad.lastLogin || ad.addedAt) && <span>• ក្រោយគេបង្អស់៖ {new Date(ad.lastLogin || ad.addedAt).toLocaleDateString()}</span>}
                    </div>
                  </div>
                  
                  {ad.email !== 'broponleu998@gmail.com' && ad.email !== 'mrponleu20000@gmail.com' && (
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => {
                          setEditingAdminEmail(ad.email);
                          setNewAdminEmail(ad.email);
                          setNewAdminRole(ad.role || 'user');

                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-500/10 rounded-lg transition-colors"
                    >
                      <Edit2 size={18} />
                    </button>
                    <button 
                      onClick={async () => {
                        if(window.confirm('តើអ្នកពិតជាចង់លុបគណនីនេះមែនទេ?')) {
                          try {
                            await deleteDoc(doc(db, 'users', ad.email));
                            showNotification('បានលុបគណនីជោគជ័យ');
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
                  )}
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
                <h3 className="text-lg font-bold text-white">
                  {activeTab === 'videos' 
                    ? (editingDoc ? 'កែប្រែវីដេអូមេរៀន' : 'បញ្ចូលវីដេអូមេរៀនថ្មី') 
                    : (editingDoc ? 'កែប្រែទិន្នន័យឯកសារ' : 'បញ្ចូលឯកសារថ្មី')
                  }
                </h3>
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
                        {(activeTab === 'videos' || (activeTab === 'manage' && manageTab === 'videos')) ? (
                          videoCategories.map((c) => (
                             <option key={c.id} value={c.name}>{c.name}</option>
                          ))
                        ) : (
                          categories.map((c) => (
                             <option key={c.id} value={c.name}>{c.name}</option>
                          ))
                        )}
                      </select>
                    </div>
                    <div>
                      <label className={labelClasses}>ប្រភេទរង (Sub Type)</label>
                      <select value={formData.subType || ''} onChange={e => setFormData({...formData, subType: e.target.value})} className={inputClasses} disabled={!formData.type}>
                         <option value="">ជ្រើសរើសប្រភេទរង...</option>
                         {formData.type && ((activeTab === 'videos' || (activeTab === 'manage' && manageTab === 'videos')) ? (
                           videoCategories.find(c => c.name === formData.type)?.subTypes.map((sub: string, idx: number) => (
                             <option key={idx} value={sub}>{sub}</option>
                           ))
                         ) : (
                           categories.find(c => c.name === formData.type)?.subTypes.map((sub: string, idx: number) => (
                             <option key={idx} value={sub}>{sub}</option>
                           ))
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
                    <label className={labelClasses}>ស្ថានភាពបង់ប្រាក់ (Payment Status)</label>
                    <div className="flex items-center gap-4 mt-2">
                       <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-300">
                         <input type="radio" checked={formData.isFree !== false} onChange={() => setFormData({...formData, isFree: true})} className="w-4 h-4 text-blue-600 bg-[#0A0C10] border-slate-600 focus:ring-blue-600 focus:ring-2" />
                         ឥតគិតថ្លៃ (Free)
                       </label>
                       <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-300">
                         <input type="radio" checked={formData.isFree === false} onChange={() => setFormData({...formData, isFree: false})} className="w-4 h-4 text-blue-600 bg-[#0A0C10] border-slate-600 focus:ring-blue-600 focus:ring-2" />
                         បង់ប្រាក់ (Paid)
                       </label>
                    </div>
                  </div>

                  <div>
                    <label className={labelClasses}>
                      តំណទាញយក (Download URL) {!(activeTab === 'videos' || (activeTab === 'manage' && manageTab === 'videos')) && <span className="text-red-500">*</span>}
                    </label>
                    <input 
                      required={!(activeTab === 'videos' || (activeTab === 'manage' && manageTab === 'videos'))} 
                      type="text" 
                      value={formData.downloadUrl || ''} 
                      onChange={e => setFormData({...formData, downloadUrl: e.target.value})} 
                      className={inputClasses} 
                      placeholder={(activeTab === 'videos' || (activeTab === 'manage' && manageTab === 'videos')) ? "# (ឬវីដេអូតំណភ្ជាប់បើចង់)" : "#"} 
                    />
                  </div>

                  <div>
                    <label className={labelClasses}>
                      តំណភ្ជាប់វីដេអូ YouTube / Link ផ្សេងៗ (Video URL) {(activeTab === 'videos' || (activeTab === 'manage' && manageTab === 'videos')) && <span className="text-red-500">*</span>}
                    </label>
                    <input 
                      required={(activeTab === 'videos' || (activeTab === 'manage' && manageTab === 'videos'))} 
                      type="text" 
                      value={formData.youtubeUrl || ''} 
                      onChange={e => setFormData({...formData, youtubeUrl: e.target.value})} 
                      className={inputClasses} 
                      placeholder={(activeTab === 'videos' || (activeTab === 'manage' && manageTab === 'videos')) ? "https://www.youtube.com/watch?v=..." : "https://www.youtube.com/watch?v=... (តាមជម្រើស)"} 
                    />
                  </div>

                  {(activeTab === 'videos' || (activeTab === 'manage' && manageTab === 'videos')) && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className={labelClasses}>រយៈពេលវីដេអូ (Duration)</label>
                        <input 
                          type="text" 
                          value={formData.duration || ''} 
                          onChange={e => setFormData({...formData, duration: e.target.value})} 
                          className={inputClasses} 
                          placeholder="ឧទហរណ៍៖ ២៥ នាទី" 
                        />
                      </div>
                      <div>
                        <label className={labelClasses}>ឈ្មោះគ្រូបង្រៀន (Instructor)</label>
                        <input 
                          type="text" 
                          value={formData.instructor || ''} 
                          onChange={e => setFormData({...formData, instructor: e.target.value})} 
                          className={inputClasses} 
                          placeholder="ឧទហរណ៍៖ លោកគ្រូ ហេង ពិសិដ្ឋ" 
                        />
                      </div>
                      <div>
                        <label className={labelClasses}>លំដាប់មេរៀនទី (Lesson Order)</label>
                        <input 
                          type="number" 
                          value={formData.lessonOrder || ''} 
                          onChange={e => setFormData({...formData, lessonOrder: e.target.value ? Number(e.target.value) : undefined})} 
                          className={inputClasses} 
                          placeholder="ឧទាហរណ៍៖ ១" 
                        />
                      </div>
                    </div>
                  )}
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

      {/* Video Category Editor Modal */}
      <AnimatePresence>
        {isVideoCategoryModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg bg-[#161B22] border-0 sm:border border-white/10 sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col h-full sm:h-auto sm:max-h-[90vh]"
            >
              <div className="px-6 py-5 border-b border-white/5 flex justify-between items-center bg-[#0A0C10]/50 shrink-0">
                <h3 className="text-lg font-bold text-white">{editingVideoCategory ? 'កែប្រែប្រភេទវីដេអូ' : (videoCategoryModalMode === 'subtype' ? 'បញ្ចូលប្រភេទរងវីដេអូថ្មី' : 'បញ្ចូលប្រភេទវីដេអូថ្មី')}</h3>
                <button onClick={() => setIsVideoCategoryModalOpen(false)} className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-white/5 transition"><X size={20}/></button>
              </div>
              
              <div className="p-6 overflow-y-auto flex-1">
                <form id="video-category-form" onSubmit={handleVideoCategorySubmit} className="flex flex-col gap-5">
                  {!editingVideoCategory && videoCategoryModalMode === 'subtype' ? (
                    <div>
                      <label className={labelClasses}>ជ្រើសរើសប្រភេទវីដេអូ (Video Category)</label>
                      <select required value={videoCategoryFormData.name || ''} onChange={e => setVideoCategoryFormData({...videoCategoryFormData, name: e.target.value})} className={inputClasses}>
                        <option value="" disabled>ជ្រើសរើសប្រភេទវីដេអូ...</option>
                        {videoCategories.map((c) => (
                           <option key={c.id} value={c.name}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div>
                      <label className={labelClasses}>ឈ្មោះប្រភេទវីដេអូ</label>
                      <input required type="text" value={videoCategoryFormData.name || ''} onChange={e => setVideoCategoryFormData({...videoCategoryFormData, name: e.target.value})} className={inputClasses} placeholder="ឧ. កុំព្យូទ័រ" />
                    </div>
                  )}
                  <div>
                    <label className={labelClasses}>ប្រភេទរង (ប្រើសញ្ញាក្បៀស ',' ដើម្បីបំបែក)</label>
                    <textarea rows={3} required={videoCategoryModalMode === 'subtype'} value={videoCategoryFormData.subTypes || ''} onChange={e => setVideoCategoryFormData({...videoCategoryFormData, subTypes: e.target.value})} className={`${inputClasses} resize-none`} placeholder="ឧ. Word, Excel, PowerPoint" />
                  </div>
                </form>
              </div>

              <div className="px-6 py-5 border-t border-white/5 bg-[#0A0C10]/50 flex justify-end gap-3 shrink-0">
                <button type="button" onClick={() => setIsVideoCategoryModalOpen(false)} className="px-5 py-2.5 rounded-lg text-sm font-bold text-slate-300 hover:bg-white/5 transition">បោះបង់</button>
                <button type="submit" form="video-category-form" className="px-5 py-2.5 rounded-lg text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 transition">
                  {editingVideoCategory ? 'រក្សាទុកការប្រែប្រួល' : (videoCategoryModalMode === 'subtype' ? 'បញ្ចូលប្រភេទរង' : 'បញ្ចូលប្រភេទ')}
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
                   deleteConfirm.type === 'video_category' ? 'តើអ្នកពិតជាចង់លុបប្រភេទវីដេអូនេះមែនទេ?' :
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
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setIsLoginModalOpen(false)}>
          <div className="bg-[#161B22] p-8 rounded-2xl max-w-sm w-full border border-white/10 shadow-2xl flex flex-col gap-6" onClick={e => e.stopPropagation()}>
            <div className="text-center">
               <h3 className="text-xl font-bold text-white mb-2 font-['KhmerOSBattambang']">ចូលគណនី</h3>
               <p className="text-sm text-slate-400">សូមជ្រើសរើសវិធីសាស្ត្រខាងក្រោម</p>
            </div>
            
            <div className="flex justify-center">
               <button 
                  onClick={() => {
                     setIsLoginModalOpen(false);
                     signInWithGoogle();
                  }} 
                  className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white hover:bg-slate-100 text-black rounded-xl text-sm font-bold transition-all shadow-sm"
               >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  ចូលតាមរយៈ Google
               </button>
            </div>
            
            <div className="relative py-2">
               <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/10"></div>
               </div>
               <div className="relative flex justify-center text-xs">
                  <span className="bg-[#161B22] px-3 font-bold text-slate-500 uppercase">ឬសម្រាប់តេស្តសាកល្បង</span>
               </div>
            </div>

            <div className="flex flex-col gap-3">
               <input
                 type="email"
                 value={loginEmail}
                 onChange={(e) => setLoginEmail(e.target.value)}
                 placeholder="ឧ. user@gmail.com"
                 className="w-full bg-[#0A0C10] border border-white/10 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
               />
               <button onClick={handleLoginSubmit} className="w-full py-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium transition-colors border border-white/5">ចូលដោយ Email</button>
            </div>
            
            <button onClick={() => setIsLoginModalOpen(false)} className="mx-auto text-sm text-slate-500 hover:text-white transition-colors mt-2">បិទផ្ទាំងនេះ</button>
          </div>
        </div>
      )}
      <AnimatePresence>
        {lockedDocPrompt && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-[#161B22] w-full max-w-md border border-amber-500/20 rounded-2xl overflow-hidden flex flex-col shadow-2xl"
            >
              <div className="flex items-center justify-between p-4 border-b border-white/5 bg-amber-500/5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-amber-500/20 text-amber-500 flex items-center justify-center">
                    <Lock size={20} className="stroke-[2.5]" />
                  </div>
                  <h2 className="text-lg font-bold text-white">ឯកសារជាប់សោរ</h2>
                </div>
                <button onClick={() => setLockedDocPrompt(null)} className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-white/5 transition"><X size={20}/></button>
              </div>
              <div className="p-6">
                <p className="text-slate-300 text-sm leading-relaxed mb-6">
                  ឯកសារ <span className="font-bold text-white">"{lockedDocPrompt.title}"</span> នេះតម្រូវឲ្យមានការបង់ប្រាក់។ ដើម្បីអាចចូលមើល និងទាញយកបាន សូមទាក់ទងទៅកាន់ Admin តាមរយៈលេខទូរសព្ទ ឬ Telegram ខាងក្រោម៖
                </p>
                
                <div className="flex flex-col gap-3">
                  <a href="tel:0973707998" className="flex items-center gap-3 p-4 bg-[#0A0C10] border border-white/5 rounded-xl hover:border-amber-500/30 transition-colors group">
                    <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg group-hover:scale-110 transition-transform"><Phone size={20} /></div>
                    <div>
                      <div className="text-xs text-slate-500 mb-0.5">លេខទូរសព្ទ</div>
                      <div className="text-sm font-bold text-white">097 370 7998</div>
                    </div>
                  </a>
                  
                  <a href="https://t.me/MRPONLEU" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-4 bg-[#0A0C10] border border-white/5 rounded-xl hover:border-amber-500/30 transition-colors group">
                    <div className="p-2 bg-sky-500/10 text-sky-400 rounded-lg group-hover:scale-110 transition-transform"><MessageCircle size={20} /></div>
                    <div>
                      <div className="text-xs text-slate-500 mb-0.5">Telegram</div>
                      <div className="text-sm font-bold text-white">@MRPONLEU</div>
                    </div>
                  </a>
                  
                  <a href="https://www.facebook.com/share/1GXPhd8Nh7/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-4 bg-[#0A0C10] border border-white/5 rounded-xl hover:border-amber-500/30 transition-colors group">
                    <div className="p-2 bg-blue-600/10 text-blue-500 rounded-lg group-hover:scale-110 transition-transform"><Facebook size={20} /></div>
                    <div>
                      <div className="text-xs text-slate-500 mb-0.5">Facebook</div>
                      <div className="text-sm font-bold text-white">Lei Ponleu</div>
                    </div>
                  </a>
                </div>
              </div>
              <div className="p-4 border-t border-white/5 flex justify-end bg-black/20">
                <button onClick={() => setLockedDocPrompt(null)} className="px-5 py-2.5 rounded-lg text-sm font-bold text-white bg-white/10 hover:bg-white/20 transition">បិទ</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
                  <h2 className="text-lg font-medium text-white truncate flex items-center gap-2">
                    {viewingDoc.title}
                    {viewingDoc.isFree === false && (
                      <span className="px-1.5 py-0.5 text-[10px] font-bold bg-amber-500/10 text-amber-500 rounded flex items-center justify-center shrink-0 hidden sm:flex" title="បង់ប្រាក់"><Lock size={12} className="stroke-[2.5]" /></span>
                    )}
                  </h2>
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

      <AnimatePresence>
        {activeYoutubeDoc && (() => {
          const playlistVideos = allVideoDocs
            .filter(v => v.type === activeYoutubeDoc.type && v.subType === activeYoutubeDoc.subType && (!v.isHidden || isAdminState))
            .sort((a, b) => {
              const orderA = a.lessonOrder !== undefined ? a.lessonOrder : 999;
              const orderB = b.lessonOrder !== undefined ? b.lessonOrder : 999;
              if (orderA !== orderB) return orderA - orderB;
              return a.title.localeCompare(b.title, 'km');
            });
            
          const playlistGroups: { chapter: string, videos: typeof playlistVideos }[] = [];
          const groupsMap: { [key: string]: typeof playlistVideos } = {};
          playlistVideos.forEach(v => {
            const chap = v.subType || 'ផ្សេងៗ';
            if (!groupsMap[chap]) groupsMap[chap] = [];
            groupsMap[chap].push(v);
          });
          Object.keys(groupsMap).sort((a,b) => {
            if (a === 'ផ្សេងៗ') return 1;
            if (b === 'ផ្សេងៗ') return -1;
            return a.localeCompare(b, 'km');
          }).forEach(k => {
            playlistGroups.push({ chapter: k, videos: groupsMap[k] });
          });

          return (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 p-0 sm:p-4 md:p-6 lg:p-8"
            >
              <motion.div
                initial={{ scale: 0.95 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.1 }}
                className="bg-[#0E1117] w-full max-w-6xl h-full sm:h-[85vh] sm:max-h-[750px] sm:rounded-2xl border-0 sm:border border-white/10 flex flex-col lg:flex-row overflow-hidden shadow-2xl"
              >
                {/* LEFT CONSOLE SCREEN (Video Player + Metadatas) */}
                <div className="flex-1 flex flex-col lg:h-full overflow-hidden bg-black">
                  {/* Top Bar inside Video Panel */}
                  <div className="flex items-center justify-between p-4 bg-[#0A0C10] border-b border-white/5">
                    <span className="text-slate-400 text-xs font-semibold uppercase truncate shrink text-blue-400">
                      {activeYoutubeDoc.type} • {activeYoutubeDoc.subType || 'វីដេអូ'}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setShowPlaylist(!showPlaylist)}
                        className="flex items-center gap-1.5 text-slate-400 hover:text-white px-2 py-1.5 rounded-md hover:bg-white/5 transition-colors text-[11px] sm:text-xs font-bold"
                      >
                        <Menu size={16} /> 
                        <span className="hidden sm:inline">{showPlaylist ? 'បិទបញ្ជីមេរៀន' : 'បើកបញ្ជីមេរៀន'}</span>
                      </button>
                      <button 
                        onClick={() => setActiveYoutubeDoc(null)} 
                        className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-white/5 transition-colors lg:hidden"
                      >
                        <X size={20} />
                      </button>
                    </div>
                  </div>

                  {/* Player Container */}
                  <div className="relative w-full aspect-video bg-black flex-shrink-0">
                    {getYouTubeEmbedUrl(activeYoutubeDoc.youtubeUrl || '') ? (
                      <iframe
                        src={getYouTubeEmbedUrl(activeYoutubeDoc.youtubeUrl || '')}
                        className="absolute inset-0 w-full h-full border-0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                        title={activeYoutubeDoc.title}
                      />
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 p-6 text-center">
                        <X size={48} className="text-red-500 mb-3" />
                        <p className="font-semibold text-white mb-1">មិនអាចចាក់វីដេអូបានទេ</p>
                        <p className="text-sm text-slate-500">តំណភ្ជាប់ YouTube មិនត្រឹមត្រូវ ឬមិនមែនជាទម្រង់ដែលអាចចាក់បាន។</p>
                      </div>
                    )}
                  </div>

                  {/* Scrollable Information Underneath */}
                  <div className="flex-1 p-5 md:p-6 overflow-y-auto bg-[#0E1117] border-t border-white/5">
                    <div className="flex flex-col gap-4">
                      {/* Course / Lesson Header */}
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="bg-red-600/10 text-red-500 text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full border border-red-500/10 flex items-center gap-1">
                            <Youtube size={12} fill="currentColor" /> {activeYoutubeDoc.type || 'វីដេអូមេរៀន'}
                          </span>
                          {activeYoutubeDoc.subType && (
                            <span className="bg-blue-600/10 text-blue-400 text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-blue-500/10 flex items-center gap-1">
                              <Folder size={12} fill="currentColor" className="text-blue-500" /> {activeYoutubeDoc.subType}
                            </span>
                          )}
                          {activeYoutubeDoc.isFree === false ? (
                            <span className="bg-amber-500/10 text-amber-500 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-500/10 flex items-center gap-1">
                              <Lock size={10} /> Pro Member
                            </span>
                          ) : (
                            <span className="bg-slate-500/10 text-emerald-500 text-[10px] font-bold px-2 py-0.5 rounded-full border-slate-500/20">
                              ឥតគិតថ្លៃ (Free)
                            </span>
                          )}
                        </div>
                        <h2 className="text-lg md:text-xl font-bold text-white leading-relaxed">
                          {activeYoutubeDoc.title}
                        </h2>
                      </div>

                      {/* Duration block */}
                      <div className="flex flex-wrap items-center gap-4 py-3 border-y border-white/5 text-xs text-slate-400">
                        {activeYoutubeDoc.duration && (
                          <div className="flex items-center gap-2">
                            <div className="text-slate-500">រយៈពេលសិក្សា៖</div>
                            <div className="font-semibold text-slate-200">{activeYoutubeDoc.duration}</div>
                          </div>
                        )}
                      </div>

                      {/* Description */}
                      {activeYoutubeDoc.description && (
                        <div className="bg-white/[0.02] p-4 rounded-xl border border-white/5">
                          <h4 className="text-xs font-bold text-slate-300 mb-2 uppercase tracking-wide">សេចក្តីពិពណ៌នា</h4>
                          <p className="text-slate-400 text-sm leading-relaxed whitespace-pre-wrap">
                            {activeYoutubeDoc.description}
                          </p>
                        </div>
                      )}

                      {/* Video materials & original references */}
                      <div className="flex flex-col sm:flex-row gap-3 pt-2">
                        <a 
                          href={activeYoutubeDoc.youtubeUrl} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="flex-1 flex items-center justify-center gap-2 bg-[#1A1F26] hover:bg-[#252C36] text-white text-sm font-semibold py-3 px-4 rounded-xl border border-white/10 transition-colors"
                        >
                          <Youtube size={18} fill="currentColor" className="text-red-500" />
                          <span>ទស្សនាលើ YouTube ផ្ទាល់</span>
                        </a>

                        {activeYoutubeDoc.downloadUrl && activeYoutubeDoc.downloadUrl !== '#' && (
                          <a 
                            href={activeYoutubeDoc.downloadUrl} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-3 px-4 rounded-xl transition-colors shadow-lg shadow-blue-600/10"
                          >
                            <Download size={18} />
                            <span>ទាញយកឯកសារមេរៀន (PDF/ស្លាយ)</span>
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* RIGHT LESSONS PLAYLIST SIDEBAR */}
                {showPlaylist && (
                  <div className="w-full lg:w-[360px] border-t lg:border-t-0 lg:border-l border-white/10 bg-[#161B22] flex flex-col h-[50vh] lg:h-full overflow-hidden shrink-0 transition-all duration-300">
                    {/* Playlist Header */}
                    <div className="p-4 bg-[#0A0C10]/40 border-b border-white/5 flex items-center justify-between">
                      <div>
                        <h3 className="font-bold text-white text-sm flex items-center gap-1.5">
                          <Book size={16} className="text-blue-400" />
                          បញ្ជីភាគមេរៀន
                        </h3>
                        <p className="text-[10px] text-slate-500 mt-0.5">{activeYoutubeDoc.type} • មានសរុប {playlistVideos.length} មេរៀន</p>
                      </div>
                      {/* Desktop Close Player Button */}
                      <button 
                        onClick={() => setActiveYoutubeDoc(null)} 
                        className="hidden lg:flex text-slate-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-white/10 transition-colors tooltip title='បិទផ្ទាំងនេះ'"
                        title="បិទផ្ទាំងនេះ"
                      >
                        <X size={18} />
                      </button>
                    </div>

                    {/* Playlist Items */}
                    <div className="flex-1 overflow-y-auto mix-blend-screen bg-[#161B22]">
                      {playlistGroups.map((group) => (
                        <div key={group.chapter} className="border-b border-white/5 last:border-0 pb-4">
                          <h4 className="sticky top-0 bg-[#0A0C10]/95 backdrop-blur-sm z-10 text-xs font-extrabold text-blue-400 py-2.5 px-4 flex items-center gap-2 border-b border-white/5">
                            <Folder size={14} /> {group.chapter}
                          </h4>
                          <div className="divide-y divide-white/[0.03]">
                            {group.videos.map((item) => {
                              const isActive = item.id === activeYoutubeDoc.id;
                              return (
                                <div 
                                  key={item.id}
                                  onClick={() => handlePlayVideo(item)}
                                  className={`flex gap-3 p-3 text-left transition-colors cursor-pointer select-none items-start relative border-l-4 ${isActive ? 'bg-red-600/[0.06] border-red-500' : 'hover:bg-white/[0.02] border-transparent'}`}
                                >
                                  {/* Mini Thumbnail */}
                                  <div className="relative w-16 h-10 rounded overflow-hidden aspect-video bg-black/60 shrink-0 border border-white/5">
                                    <img 
                                      src={item.coverUrl ? getDriveImageUrl(item.coverUrl) : getYouTubeThumbnail(item.youtubeUrl)} 
                                      className="w-full h-full object-cover"
                                      alt=""
                                    />
                                    {isActive ? (
                                      <div className="absolute inset-0 bg-red-600/30 flex items-center justify-center">
                                        <span className="flex gap-0.5 items-end h-3">
                                          <span className="w-0.5 bg-white rounded-full animate-bounce h-full"></span>
                                          <span className="w-0.5 bg-white rounded-full animate-bounce h-2/3" style={{animationDelay: '0.2s'}}></span>
                                          <span className="w-0.5 bg-white rounded-full animate-bounce h-full" style={{animationDelay: '0.4s'}}></span>
                                        </span>
                                      </div>
                                    ) : (
                                      <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                                        <Play size={10} fill="currentColor" className="text-white ml-0.5" />
                                      </div>
                                    )}
                                  </div>

                                  {/* Text Descriptions */}
                                  <div className="flex-1 min-w-0">
                                    <div className="flex gap-1.5 items-center mb-0.5">
                                      {item.isFree === false && (
                                        <Lock size={10} className="text-amber-500" />
                                      )}
                                    </div>
                                    <h4 className={`text-xs font-semibold leading-relaxed truncate-2 ${isActive ? 'text-red-400' : 'text-slate-200'}`}>
                                      {item.title}
                                    </h4>
                                    <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-500">
                                      {item.duration && <span>⏱️ {item.duration}</span>}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}
