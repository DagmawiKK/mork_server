(() => {
	const $ = (sel) => document.querySelector(sel);
	let currentView = 'symbol';
	let cachedSymbolTokens = [];
	let cachedBytePaths = [];
	let lastExpandFn = null;
	let cyRef = null;
	const api = {
		upload: async (pattern, template, data, format = 'metta') => {
			const url = `/upload/${encodeURIComponent(pattern)}/${encodeURIComponent(template)}?format=${encodeURIComponent(format)}`;
			const res = await fetch(url, { method: 'POST', body: data });
			const text = await res.text();
			if (!res.ok) throw new Error(text || res.statusText);
			return text;
		},
		explore: async (expr, tokenBytes) => {
			const hasToken = tokenBytes && tokenBytes.length > 0;
			const tokenStr = hasToken ? encodeToken(tokenBytes) : '';
			const url = hasToken
				? `/explore/${encodeURIComponent(expr)}/${tokenStr}`
				: `/explore/${encodeURIComponent(expr)}//`;
			const res = await fetch(url);
			if (!res.ok) throw new Error(await res.text());
			return res.json();
		},
		exportMetta: async (pattern, template) => {
			const url = `/export/${encodeURIComponent(pattern)}/${encodeURIComponent(template)}?format=metta`;
			const res = await fetch(url);
			if (!res.ok) throw new Error(await res.text());
			return res.text();
		},
		exportPaths: async (pattern, template) => {
			const url = `/export/${encodeURIComponent(pattern)}/${encodeURIComponent(template)}?format=paths`;
			const res = await fetch(url);
			if (!res.ok) throw new Error(await res.text());
			return res.text();
		},
		exportRaw: async (pattern, template) => {
			const url = `/export/${encodeURIComponent(pattern)}/${encodeURIComponent(template)}?format=raw`;
			const res = await fetch(url);
			if (!res.ok) throw new Error(await res.text());
			return res.text();
		},
		pathsResolved: async (pattern, template, maxWrite) => {
			const url = `/paths_resolved/${encodeURIComponent(pattern)}/${encodeURIComponent(template)}${maxWrite?`?max_write=${maxWrite}`:''}`;
			const res = await fetch(url);
			if (!res.ok) throw new Error(await res.text());
			return res.json();
		}
	};

	function encodeToken(bytes) {
		let out = '';
		for (let i = 0; i < bytes.length; i++) out += `%${bytes[i].toString(16).padStart(2, '0')}`;
		return out;
	}

	function renderExploreList(container, items, expr) {
		container.innerHTML = '';
		if (!items || items.length === 0) {
			container.textContent = '() (empty)';
			return;
		}
		items.forEach((it) => {
			const row = document.createElement('div');
			row.className = 'row';
			const tokenSpan = document.createElement('span');
			tokenSpan.className = 'token';
			tokenSpan.textContent = `token=[${it.token.join(', ')}]`;
			const exprSpan = document.createElement('span');
			exprSpan.className = 'expr';
			exprSpan.textContent = ` expr=${it.expr}`;
			const btn = document.createElement('button');
			btn.textContent = 'Descend';
			btn.addEventListener('click', async () => {
				btn.disabled = true;
				try {
					const tokenBytes = new Uint8Array(it.token);
					const next = await api.explore(expr, tokenBytes);
					const sub = document.createElement('div');
					sub.className = 'node';
					row.appendChild(sub);
					renderExploreList(sub, next, expr);
				} catch (e) { alert(e.message); } finally { btn.disabled = false; }
			});
			row.appendChild(tokenSpan);
			row.appendChild(document.createTextNode(' '));
			row.appendChild(exprSpan);
			row.appendChild(document.createTextNode(' '));
			row.appendChild(btn);
			container.appendChild(row);
		});
	}

	async function renderProgressiveCytoscape(initial, expandFn) {
		const cy = cytoscape({
			container: $('#cy'),
			elements: [...initial.nodes, ...initial.edges],
			style: [
				{ selector: 'node', style: { 'background-color': '#4c7dff', 'label': 'data(label)', 'color': '#e7ecf5', 'font-size': '10px', 'text-outline-color': '#0b1026', 'text-outline-width': 2 } },
				{ selector: 'node[expandable = "true"]', style: { 'background-color': '#ff6b35', 'border-width': 2, 'border-color': '#333' } },
				{ selector: 'edge', style: { 'width': 1.5, 'line-color': '#7aa2ff', 'target-arrow-color': '#7aa2ff', 'target-arrow-shape': 'triangle', 'curve-style': 'bezier' } }
			],
			layout: { name: 'breadthfirst', directed: true, padding: 10, spacingFactor: 1.1 }
		});
		cyRef = cy;
		cy.on('tap', 'node[expandable = "true"]', async (evt) => {
			const node = evt.target;
			const id = node.id();
			try {
				const { nodes: newNodes, edges: newEdges } = await expandFn(id);
				if (newNodes.length > 0 || newEdges.length > 0) {
					cy.add([...newNodes, ...newEdges]);
					node.data('expandable', 'false');
					cy.layout({ name: 'breadthfirst', directed: true, padding: 10, spacingFactor: 1.1 }).run();
				}
			} catch (e) { console.error('Expansion error', e); }
		});
		return cy;
	}

	function renderTrieCytoscape(initial, expandFn) {
		const cy = cytoscape({
			container: $('#cy'),
			elements: [...initial.nodes, ...initial.edges],
			style: [
				{ selector: 'node', style: { 'background-color': '#4c7dff', 'label': 'data(label)', 'color': '#e7ecf5', 'font-size': '10px', 'text-outline-color': '#0b1026', 'text-outline-width': 2 } },
				{ selector: 'node[expandable = "true"]', style: { 'background-color': '#ff6b35', 'border-width': 2, 'border-color': '#333' } },
				{ selector: 'edge', style: { 'width': 1.5, 'line-color': '#7aa2ff', 'target-arrow-color': '#7aa2ff', 'target-arrow-shape': 'triangle', 'curve-style': 'bezier' } }
			],
			layout: { name: 'breadthfirst', directed: true, padding: 10, spacingFactor: 1.1 }
		});
		cyRef = cy;
		lastExpandFn = expandFn;
		cy.on('tap', 'node[expandable = "true"]', async (evt) => {
			const node = evt.target;
			const id = node.id();
			try {
				const { nodes: newNodes, edges: newEdges } = await expandFn(id);
				if (newNodes.length > 0 || newEdges.length > 0) {
					cy.add([...newNodes, ...newEdges]);
					node.data('expandable', 'false');
					cy.layout({ name: 'breadthfirst', directed: true, padding: 10, spacingFactor: 1.1 }).run();
				}
			} catch (e) { console.error('Trie expansion error', e); }
		});
		return cy;
	}

	function parseSexprToSymbolSequences(text) {
		const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
		const symbolPaths = [];
		for (const line of lines) {
			const matches = line.match(/"(?:[^"\\]|\\.)*"|[^\s()]+/g);
			if (matches && matches.length) symbolPaths.push(matches.map(tok => tok.replace(/^"|"$/g, '')));
		}
		return symbolPaths;
	}

	function parsePathsToSymbolSequences(text) {
		const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
		const symbolPaths = [];
		for (const line of lines) {
			const matches = line.match(/"(?:[^"\\]|\\.)*"|[^\s(),]+/g);
			if (matches && matches.length) symbolPaths.push(matches.map(tok => tok.replace(/^"|"$/g, '')));
		}
		return symbolPaths;
	}

	function markExpandableSymbolNodes(elements, depthLimit) {
		const ids = new Set(elements.nodes.map(n => n.data.id));
		for (const toks of cachedSymbolTokens) {
			if (toks.length <= depthLimit) continue;
			const prefixId = 's:' + toks.slice(0, depthLimit).join('/');
			if (ids.has(prefixId)) {
				const node = elements.nodes.find(n => n.data.id === prefixId);
				if (node) node.data.expandable = 'true';
			}
		}
	}

	function markExpandableByteNodes(elements, depthLimit) {
		const ids = new Set(elements.nodes.map(n => n.data.id));
		// Map from prefixId to a boolean: does it have any children?
		const hasChild = new Map();
		for (const arr of cachedBytePaths) {
			if (arr.length <= depthLimit) continue;
			const prefix = arr.slice(0, depthLimit);
			const prefixId = 'p:' + prefix.join('-');
			hasChild.set(prefixId, true);
		}
		for (const node of elements.nodes) {
			if (hasChild.get(node.data.id)) {
				node.data.expandable = 'true';
			}
		}
	}

	async function buildRawByteTrie(pattern, template, maxWrite, depthLimit = 4) {  
		const items = await api.pathsResolved(pattern, template, maxWrite);  
		cachedBytePaths = [];  
		
		// Extract byte paths from resolved data  
		for (const it of items) {  
			const arr = Array.from(it.raw.matchAll(/\d+/g)).map(m => parseInt(m[0], 10));  
			cachedBytePaths.push(arr);  
		}  
	
		const trie = new Map();  
		const rootKey = 'p:';  
		trie.set(rootKey, new Map());  
		
		// Build trie structure up to depth limit  
		for (const arr of cachedBytePaths) {  
			let prefix = [];  
			for (const b of arr.slice(0, depthLimit)) {  
				const fromKey = 'p:' + prefix.join('-');  
				if (!trie.has(fromKey)) trie.set(fromKey, new Map());  
				const nextPrefix = prefix.concat([b]);  
				const toKey = 'p:' + nextPrefix.join('-');  
				if (!trie.has(toKey)) trie.set(toKey, new Map());  
				trie.get(fromKey).set(b, toKey);  
				prefix = nextPrefix;  
			}  
		}  
		
		// Enhanced byte labeling based on MORK's tag system  
		const labelByte = (b) => {  
			// Handle MORK's tag system based on bytestring encoding  
			if (b >= 0 && b <= 63) return `[${b}]`; // Arity tags  
			if (b >= 128 && b <= 191) return `_${b-128}`; // Variable references    
			if (b >= 192 && b <= 255) return `(${b-192})`; // Symbol sizes  
			if (b >= 33 && b <= 126) return String.fromCharCode(b); // Printable ASCII  
			return `\\x${b.toString(16).padStart(2, '0')}`; // Hex fallback for other bytes  
		};  
		
		const nodes = [];  
		const edges = [];  
		
		for (const [key, edgeMap] of trie.entries()) {  
			let label;  
			if (key === 'p:') {  
				label = '(root)';  
			} else {  
				const parts = key.slice(2).split('-').filter(Boolean).map(Number);  
				if (parts.length === 1) {  
					// First level - show both raw byte and interpreted meaning  
					const b = parts[0];  
					label = `${b} ${labelByte(b)}`;  
				} else {  
					// Deeper levels - show path as byte sequence  
					label = parts.join('-');  
				}  
			}  
			
			nodes.push({   
				data: {   
					id: key || 'p:',   
					label,   
					expandable: 'false',  
					rawBytes: key.slice(2) // Store raw byte path for reference  
				}   
			});  
			
			for (const [b, toKey] of edgeMap.entries()) {  
				edges.push({   
					data: {   
						id: key + '>' + toKey + ':' + b,   
						source: key || 'p:',   
						target: toKey,  
						label: labelByte(b) // Label edges with interpreted byte meaning  
					}   
				});  
			}  
		}  
		
		const elements = { nodes, edges };  
		markExpandableByteNodes(elements, depthLimit);  
		
		// Lazy expansion function for raw byte trie  
		const expandNode = async (nodeId) => {  
			if (!nodeId || !nodeId.startsWith('p:')) return { nodes: [], edges: [] };  
			
			const parts = nodeId.slice(2).split('-').filter(Boolean).map(Number);  
			const newNodes = [];  
			const newEdges = [];  
			
			try {  
				// Request fresh data from server  
				const fresh = await api.pathsResolved(pattern, template, maxWrite);  
				const nextBytes = new Set();  
				
				// Find all possible next bytes for this prefix  
				for (const it of fresh) {  
					const arr = Array.from(it.raw.matchAll(/\d+/g)).map(m => parseInt(m[0], 10));  
					if (arr.length <= parts.length) continue;  
					
					// Check if this path matches our prefix  
					let matches = true;  
					for (let i = 0; i < parts.length; i++) {  
						if (arr[i] !== parts[i]) { matches = false; break; }  
					}  
					if (!matches) continue;  
					
					nextBytes.add(arr[parts.length]);  
				}  
				
				// Create nodes for each possible next byte  
				for (const b of nextBytes) {  
					const toKey = 'p:' + parts.concat([b]).join('-');  
					const isFirstLevel = parts.length === 0;  
					
					let nodeLabel;  
					if (isFirstLevel) {  
						nodeLabel = `${b} ${labelByte(b)}`;  
					} else {  
						nodeLabel = parts.concat([b]).join('-');  
					}  
					let hasDeeper = false;
					for (const arr of cachedBytePaths) {
						if (arr.length > parts.length + 1) {
							let matches = true;
							for (let i = 0; i < parts.length; i++) {
								if (arr[i] !== parts[i]) { matches = false; break; }
							}
							if (matches && arr[parts.length] === b) {
								hasDeeper = true;
								break;
							}
						}
					}
									
					const nodeData = {   
						id: toKey,   
						label: nodeLabel,   
						expandable: hasDeeper ? 'true' : 'false',  
						rawBytes: parts.concat([b]).join('-')  
					};  
					
					if (!elements.nodes.find(n => n.data.id === toKey)) {  
						newNodes.push({ data: nodeData });  
						elements.nodes.push({ data: nodeData });  
					}  
					
					const edgeId = nodeId + '>' + toKey + ':' + b;  
					if (!elements.edges.find(e => e.data.id === edgeId)) {  
						const edge = {   
							data: {   
								id: edgeId,   
								source: nodeId,   
								target: toKey,  
								label: labelByte(b)  
							}   
						};  
						newEdges.push(edge);  
						elements.edges.push(edge);  
					}  
				}  
			} catch (e) {   
				console.error('Server expansion error (raw byte):', e);   
			}  
			
			return { nodes: newNodes, edges: newEdges };  
		};  
		
		return { elements, expandNode };  
	}

	async function buildSymbolTrieWithResolved(pattern, template, maxWrite, depthLimit = 4) {
		const items = await api.pathsResolved(pattern, template, maxWrite);
		const parseTokens = (expr) => (expr.match(/\"(?:[^\"\\]|\\.)*\"|[^\s()]+/g) || []).map(t => t.replace(/^\"|\"$/g, ''));
		cachedSymbolTokens = [];
		const trie = new Map();
		const rootKey = 's:';
		trie.set(rootKey, new Map());
		for (const it of items) {
			const toks = parseTokens(it.expr);
			cachedSymbolTokens.push(toks);
			let prefix = [];
			for (const sym of toks.slice(0, depthLimit)) {
				const fromKey = 's:' + prefix.join('/');
				if (!trie.has(fromKey)) trie.set(fromKey, new Map());
				const nextPrefix = prefix.concat([sym]);
				const toKey = 's:' + nextPrefix.join('/');
				if (!trie.has(toKey)) trie.set(toKey, new Map());
				trie.get(fromKey).set(sym, toKey);
				prefix = nextPrefix;
			}
		}
		const nodes = [];
		const edges = [];
		for (const [key, edgeMap] of trie.entries()) {
			const toks = key.slice(2).split('/').filter(Boolean);
			const label = toks.length === 0 ? '(root)' : toks[toks.length - 1];
			nodes.push({ data: { id: key || 's:', label, expandable: 'false' } });
			for (const [_sym, toKey] of edgeMap.entries()) {
				edges.push({ data: { id: key + '>' + toKey, source: key || 's:', target: toKey } });
			}
		}
		const elements = { nodes, edges };
		markExpandableSymbolNodes(elements, depthLimit);
		const expandNode = async (nodeId) => {
			if (!nodeId || !nodeId.startsWith('s:')) return { nodes: [], edges: [] };
			const prefix = nodeId.slice(2).split('/').filter(Boolean);
			const newNodes = [];
			const newEdges = [];
			try {
				const fresh = await api.pathsResolved(pattern, template, maxWrite);
				// Build one-level children under this prefix using fresh server data
				const byChild = new Map(); // childSym -> hasDeeper
				for (const it of fresh) {
					const toks = parseTokens(it.expr);
					if (toks.length <= prefix.length) continue;
					let matches = true;
					for (let i = 0; i < prefix.length; i++) { if (toks[i] !== prefix[i]) { matches = false; break; } }
					if (!matches) continue;
					const nextSym = toks[prefix.length];
					const hasDeeper = toks.length > prefix.length + 1;
					byChild.set(nextSym, (byChild.get(nextSym) || false) || hasDeeper);
				}
				for (const [sym, hasDeeper] of byChild.entries()) {
					const toKey = 's:' + prefix.concat([sym]).join('/');
					if (!elements.nodes.find(n => n.data.id === toKey)) newNodes.push({ data: { id: toKey, label: sym, expandable: hasDeeper ? 'true' : 'false' } });
					const edgeId = nodeId + '>' + toKey;
					if (!elements.edges.find(e => e.data.id === edgeId)) newEdges.push({ data: { id: edgeId, source: nodeId, target: toKey } });
				}
			} catch (e) { console.error('Server expansion error (symbol):', e); }
			return { nodes: newNodes, edges: newEdges };
		};
		return { elements, expandNode };
	}

	// Byte trie: last-byte-only labels; first level shows numeric arity; lazy one-level expansion
	async function buildByteTrieWithResolved(pattern, template, maxWrite, depthLimit = 4) {  
		const items = await api.pathsResolved(pattern, template, maxWrite);  
		const allPaths = items.map(it => Array.from(it.raw.matchAll(/\d+/g)).map(m => parseInt(m[0], 10)));  
		const trie = new Map();  
		const rootKey = 'p:';  
		trie.set(rootKey, new Map());  
		
		for (const arr of allPaths) {  
			let prefix = [];  
			for (const b of arr.slice(0, depthLimit)) {  
				const fromKey = 'p:' + prefix.join('-');  
				if (!trie.has(fromKey)) trie.set(fromKey, new Map());  
				const nextPrefix = prefix.concat([b]);  
				const toKey = 'p:' + nextPrefix.join('-');  
				if (!trie.has(toKey)) trie.set(toKey, new Map());  
				trie.get(fromKey).set(b, toKey);  
				prefix = nextPrefix;  
			}  
		}  
		
		const nodes = [];  
		const edges = [];  
		
		// Enhanced byte labeling based on MORK's tag system  
		const labelByte = (b) => {  
			// Handle MORK's tag system  
			if (b >= 0 && b <= 63) return `[${b}]`; // Arity tags  
			if (b >= 128 && b <= 191) return `_${b-128}`; // Variable references  
			if (b >= 192 && b <= 255) return `(${b-192})`; // Symbol sizes  
			if (b >= 33 && b <= 126) return String.fromCharCode(b); // Printable ASCII  
			return `\\x${b.toString(16).padStart(2, '0')}`; // Hex fallback  
		};  
		
		for (const [key, edgeMap] of trie.entries()) {  
			let label;  
			let arity;  
			if (key === 'p:') {  
				label = '(root)';  
			} else {  
				const parts = key.slice(2).split('-').filter(Boolean).map(Number);  
				const last = parts[parts.length - 1];  
				if (parts.length === 1) {   
					label = `${last} ${labelByte(last)}`; // Show both raw value and interpretation  
					arity = String(last);   
				} else {   
					label = labelByte(last); // Use enhanced labeling for deeper nodes  
				}  
			}  
			nodes.push({ data: { id: key || 'p:', label, expandable: 'false', ...(arity ? { arity } : {}) } });  
			
			for (const [b, toKey] of edgeMap.entries()) {  
				edges.push({   
					data: {   
						id: key + '>' + toKey + ':' + b,   
						source: key || 'p:',   
						target: toKey,  
						label: labelByte(b) // Label edges with interpreted meaning  
					}   
				});  
			}  
		}  
		
		const elements = { nodes, edges };  
		
		// Mark depthLimit nodes expandable  
		const idSet = new Set(elements.nodes.map(n => n.data.id));  
		for (const arr of allPaths) {  
			if (arr.length <= depthLimit) continue;  
			const limId = 'p:' + arr.slice(0, depthLimit).join('-');  
			if (idSet.has(limId)) {  
				const n = elements.nodes.find(n => n.data.id === limId);  
				if (n) n.data.expandable = 'true';  
			}  
		}  
		
		const expandNode = async (nodeId) => {  
			if (!nodeId || !nodeId.startsWith('p:')) return { nodes: [], edges: [] };  
			const prefix = nodeId.slice(2).split('-').filter(Boolean).map(Number);  
			const fresh = await api.pathsResolved(pattern, template, maxWrite);  
			const nextMap = new Map(); // nextByte -> hasDeeper  
			
			for (const it of fresh) {  
				const arr = Array.from(it.raw.matchAll(/\d+/g)).map(m => parseInt(m[0], 10));  
				if (arr.length <= prefix.length) continue;  
				let matches = true;  
				for (let i = 0; i < prefix.length; i++) {   
					if (arr[i] !== prefix[i]) { matches = false; break; }   
				}  
				if (!matches) continue;  
				const nextB = arr[prefix.length];  
				const hasDeeper = arr.length > prefix.length + 1;  
				nextMap.set(nextB, (nextMap.get(nextB) || false) || hasDeeper);  
			}  
			
			const newNodes = [];  
			const newEdges = [];  
			for (const [b, hasDeeper] of nextMap.entries()) {  
				const toKey = 'p:' + prefix.concat([b]).join('-');  
				const isFirstLevel = prefix.length === 0;  
				const label = isFirstLevel ? `${b} ${labelByte(b)}` : labelByte(b);  
				const data = {   
					id: toKey,   
					label,   
					expandable: hasDeeper ? 'true' : 'false',   
					...(isFirstLevel ? { arity: String(b) } : {})   
				};  
				if (!elements.nodes.find(n => n.data.id === toKey)) newNodes.push({ data });  
				
				const edgeId = nodeId + '>' + toKey + ':' + b;  
				if (!elements.edges.find(e => e.data.id === edgeId)) {  
					newEdges.push({   
						data: {   
							id: edgeId,   
							source: nodeId,   
							target: toKey,  
							label: labelByte(b)  
						}   
					});  
				}  
			}  
			
			// Persist for subsequent waves  
			elements.nodes.push(...newNodes);  
			elements.edges.push(...newEdges);  
			return { nodes: newNodes, edges: newEdges };  
		};  
		
		return { elements, expandNode };  
	}

	$('#btn-upload').addEventListener('click', async () => {
		const pattern = $('#pattern').value.trim();
		const template = $('#template').value.trim();
		const data = $('#data').value;
		const statusEl = $('#upload-status');
		statusEl.textContent = 'Uploading...';
		try {
			statusEl.textContent = await api.upload(pattern, template, data, 'metta');
			// Clear caches after successful upload
			cachedSymbolTokens = [];
			cachedBytePaths = [];
		} catch (e) {
			statusEl.textContent = 'Error: ' + e.message;
		}
	});

	$('#btn-explore-root').addEventListener('click', async () => {
		const expr = $('#explore-expr').value.trim();
		const tree = $('#explore-tree');
		tree.textContent = 'Loading...';
		try {
			const items = await api.explore(expr, new Uint8Array([]));
			renderExploreList(tree, items, expr);
		} catch (e) { tree.textContent = 'Error: ' + e.message; }
	});

	$('#btn-export').addEventListener('click', async () => {
		const pat = $('#export-pattern').value.trim();
		const tmpl = $('#export-template').value.trim();
		const out = $('#export-output');
		out.textContent = 'Exporting...';
		try { out.textContent = await api.exportPaths(pat, tmpl); } catch (e) { out.textContent = 'Error: ' + e.message; }
	});

	$('#btn-build-trie').addEventListener('click', async () => {
		const pat = $('#trie-pattern').value.trim();
		const tmpl = $('#trie-template').value.trim();
		const view = $('#trie-view').value;
		const btn = $('#btn-build-trie');
		btn.disabled = true;
		try {
			currentView = view;
			const depthLimit = Number($('#graph-depth').value) || 4;
			let builder;
			if (view === 'symbol') builder = buildSymbolTrieWithResolved;
			else if (view === 'byte') builder = buildByteTrieWithResolved;
			else builder = buildRawByteTrie;
			const { elements, expandNode } = await builder(pat, tmpl, 100000, depthLimit);
			renderTrieCytoscape(elements, expandNode);
		} catch (e) { alert('Trie build error: ' + e.message); } finally { btn.disabled = false; }
	});

	// Export current trie image (PNG)
	$('#btn-export-trie-image').addEventListener('click', () => {
		try {
			if (!cyRef) return alert('No trie to export');
			const url = cyRef.png({ full: true, scale: 2, bg: '#0b1026' });
			const a = document.createElement('a');
			a.href = url;
			a.download = 'trie.png';
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
		} catch (e) {
			alert('Export image error: ' + e.message);
		}
	});

	// Expand Next and Expand All
	async function expandNextWave() {
		if (!cyRef || !lastExpandFn) return;
		const targets = cyRef.$('node[expandable = "true"]').toArray();
		if (!targets.length) return;
		for (const node of targets) {
			const id = node.id();
			try {
				const { nodes: newNodes, edges: newEdges } = await lastExpandFn(id);
				if (newNodes.length > 0 || newEdges.length > 0) {
					cyRef.add([...newNodes, ...newEdges]);
					node.data('expandable', 'false');
				}
			} catch (e) { console.error('ExpandNext error', e); }
		}
		cyRef.layout({ name: 'breadthfirst', directed: true, padding: 10, spacingFactor: 1.1 }).run();
	}
	async function expandAll() {
		let iter = 0;
		while (true) {
			const before = cyRef.$('node[expandable = "true"]').length;
			if (!before) break;
			await expandNextWave();
			const after = cyRef.$('node[expandable = "true"]').length;
			iter++;
		}
	}

	$('#btn-expand-next').addEventListener('click', async () => {
		const btn = $('#btn-expand-next'); btn.disabled = true;
		try { await expandNextWave(); } finally { btn.disabled = false; }
	});
	$('#btn-expand-all').addEventListener('click', async () => {
		const btn = $('#btn-expand-all'); btn.disabled = true;
		try { await expandAll(); } finally { btn.disabled = false; }
	});
})(); 