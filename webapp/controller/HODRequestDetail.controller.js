// =============================================================================
// HODRequestDetail.controller.js
// -----------------------------------------------------------------------------
// SCREEN: HOD (Head of Department) view of a single Gate Pass Request.
//
// STRUCTURE OF THIS FILE (read top to bottom):
//   1) LIFECYCLE            - onInit, security setup
//   2) ROUTING               - reacting to navigation / URL changes
//   3) MODEL SETUP           - resetting the local JSON model
//   4) DATA LOADING          - calling the OData backend
//   5) DATA NORMALIZATION    - cleaning up inconsistent backend field names
//   6) MAPPING               - writing normalized data into the view model
//   7) ATTACHMENT FILE UTILS - Base64/hex parsing helpers (pure functions)
//   8) ATTACHMENT UI ACTIONS - preview dialog, download
//   9) APPROVE/REJECT/AMEND  - the actual business workflow
//  10) NAVIGATION            - back button
//
// Sections 5 and 7 are pure data-transformation helper functions (no UI
// touching) — kept in this same file for now since you asked for a single
// file, but they're written so they could be lifted into their own
// util/ modules later with zero changes if this file ever grows too large.
// =============================================================================
sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/m/MessageBox",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/base/security/URLListValidator",
	"sap/ui/core/BusyIndicator"
], function (
	BaseController,
	JSONModel,
	MessageBox,
	Filter,
	FilterOperator,
	URLListValidator,
	BusyIndicator
) {
	"use strict";

	// Default shape of the "hod" JSON model. Defined once, up here, so the
	// full field list is visible at a glance instead of buried in a function.
	var DEFAULT_MODEL_DATA = {
		GatePassReqNo: "", GatePassType: "", Status: "",
		GpDate: "", Plant: "", FiscalYear: "", Department: "",
		VendorName: "", VendorGST: "", VendorAddress: "",
		VehicleNo: "", ModeOfDispatch: "", Remarks: "",
		HODRemarks: "", totalAmount: "0.00", items: [],
		Base64Img1: "", Fname: "", Ftype: "", hasAttachment1: false, isImage1: false, isPdf1: false,
		Base64Img2: "", Fname2: "", Ftype2: "", hasAttachment2: false, isImage2: false, isPdf2: false,
		hasAttachment: false, ReturnableDate: ""
	};

	// File-signature ("magic bytes") lookup tables used to detect a file's
	// real type when the backend doesn't send a reliable type field.
	// Every file format has fixed bytes at (or near) its start —
	// e.g. every PNG begins with the hex bytes 89 50 4E 47.
	var HEX_SIGNATURES = [
		{ mime: "application/pdf", hex: "25504446" },
		{ mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", hex: "504B0304" },
		{ mime: "image/jpeg", hex: "FFD8FF" },
		{ mime: "image/png", hex: "89504E47" },
		{ mime: "image/gif", hex: "47494638" }
	];
	var BASE64_SIGNATURES = [
		{ mime: "application/pdf", marker: "JVBERi" },
		{ mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", marker: "UEsDB" },
		{ mime: "image/jpeg", marker: "/9j/" },
		{ mime: "image/png", marker: "iVBORw" }
	];

	return BaseController.extend("zgpms.meilpower.com.controller.HODRequestDetail", {

		// =========================================================================
		// 1) LIFECYCLE
		// =========================================================================

		/** Called ONCE by the framework when this view is first created. */
		onInit: function () {
			this._allowDataUriImages();
			this._resetModel();

			// Whenever the user navigates TO this screen (with a request number
			// in the URL), run _onRouteMatched. This can fire many times over
			// the view's lifetime, unlike onInit.
			this.getRouter().getRoute("HODRequestDetail").attachPatternMatched(this._onRouteMatched, this);
		},

		/**
		 * UI5's security layer blocks "data:" URIs in <Image src="..."> by
		 * default (XSS protection). We need them because attachments are
		 * rendered as inline Base64 images. Allow it once, with a fallback
		 * for older UI5 versions that don't have URLListValidator yet.
		 */
		_allowDataUriImages: function () {
			try {
				URLListValidator.add("data");
			} catch (eModern) {
				try {
					jQuery.sap.addUrlWhitelist("data"); // legacy UI5 fallback
				} catch (eLegacy) {
					// Neither API available — nothing more we can do here.
				}
			}
		},

		// =========================================================================
		// 2) ROUTING
		// =========================================================================

		/** Fires every time the user navigates to #/HODRequestDetail/{reqNo}/{gpType} */
		_onRouteMatched: function (oEvent) {
			this._resetModel();

			var oArgs = oEvent.getParameter("arguments");
			this._sReqNo = decodeURIComponent(oArgs.reqNo || "");
			this._sType = decodeURIComponent(oArgs.gpType || "NRGP");

			// Bump a "request token". If the user clicks a second request before
			// the first one's OData call finishes, the first call's response
			// arrives with a stale token and gets ignored — instead of
			// overwriting the screen with the wrong request's data.
			this._iRequestToken = (this._iRequestToken || 0) + 1;

			this._showCachedRowIfAvailable();

			if (this._sReqNo) {
				this._loadDetail(this._sReqNo, this._sType, this._iRequestToken);
			}
		},

		/**
		 * The list screen (before navigating here) may have already cached the
		 * row the user clicked on. Show it immediately for a fast/responsive
		 * feel, while the real OData call (with full item details) runs in
		 * the background.
		 */
		_showCachedRowIfAvailable: function () {
			var oTempModel = this.getOwnerComponent().getModel("hodTemp");
			if (!oTempModel) { return; }

			var oRow = oTempModel.getData();
			var oNormalized = this._normalizeGateRow(oRow);

			if (oRow && oNormalized.GatePassReqNo === this._sReqNo) {
				this._mapData(oRow);
			}
		},

		// =========================================================================
		// 3) MODEL SETUP
		// =========================================================================

		/**
		 * Resets the "hod" JSON model back to its empty default shape.
		 * Called before every load so stale data never lingers between
		 * different requests.
		 */
		_resetModel: function () {
			// Clone the default object so we never accidentally mutate the shared template
			var oData = JSON.parse(JSON.stringify(DEFAULT_MODEL_DATA));

			var oModel = this.getView().getModel("hod");
			if (oModel) {
				oModel.setData(oData);
			} else {
				this.getView().setModel(new JSONModel(oData), "hod");
			}
		},

		// =========================================================================
		// 4) DATA LOADING
		// =========================================================================

		/**
		 * Loads the full request detail (header + line items) from the backend.
		 * @param {string} sReqNo  Gate pass request number
		 * @param {string} sType   Gate pass type (e.g. "NRGP")
		 * @param {number} iToken  Request token captured when this call started —
		 *                         used to discard stale/out-of-order responses.
		 */
		_loadDetail: function (sReqNo, sType, iToken) {
			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) { return; }

			var that = this;
			BusyIndicator.show(0);

			// Filter-based read on the collection, matching the exact backend
			// URL pattern that is known to work:
			//   GateReqHdrSet?$filter=GatePassReqNo eq '...' and GatePassType eq '...'
			//   &$expand=GateReqItmNav
			// (Filter/FilterOperator handle the URL-encoding of quotes etc. for us —
			// no manual string concatenation needed.)
			var aFilters = [
				new Filter("GatePassReqNo", FilterOperator.EQ, sReqNo),
				new Filter("GatePassType", FilterOperator.EQ, sType)
			];

			oODataModel.read("/GateReqHdrSet", {
				filters: aFilters,
				urlParameters: { "$expand": "GateReqItmNav" },
				success: function (oData) {
					BusyIndicator.hide();

					// Ignore this response if the user has since navigated to a
					// different request (stale-response protection).
					if (iToken !== that._iRequestToken) { return; }

					// Collection read returns { results: [...] } — pull the single
					// matching row back out (there should be exactly one).
					var oRow = oData && oData.results && oData.results[0];

					if (oRow) {
						that._mapData(oRow);
					} else {
						MessageBox.error("No data found for request " + sReqNo);
					}
				},
				error: function () {
					BusyIndicator.hide();
					if (iToken !== that._iRequestToken) { return; }
					MessageBox.error("Failed to load details for request " + sReqNo);
				}
			});
		},

		// =========================================================================
		// 5) DATA NORMALIZATION
		// -----------------------------------------------------------------------
		// Your backend OData service is inconsistent about field-name casing
		// depending on which EntitySet you read from
		// (e.g. "GatePassReqNo" vs "GatePassreqNo", "VendorGST" vs "VendorGst").
		// Instead of every function doing  oData.Foo || oData.foo  chains,
		// we normalize ONCE right after the OData call returns, into one
		// clean, predictable object shape. Everything downstream trusts it.
		// =========================================================================

		/** Returns the first non-empty value from a list of candidates. */
		_firstDefined: function () {
			for (var i = 0; i < arguments.length; i++) {
				if (arguments[i]) { return arguments[i]; }
			}
			return "";
		},

		/**
		 * Takes a raw row from ANY of the Gate Pass related EntitySets and
		 * returns one consistent object shape. Add new field-name variants
		 * here ONLY — nowhere else in the file should need to know about
		 * the backend's casing quirks.
		 */
		_normalizeGateRow: function (oRaw) {
			oRaw = oRaw || {};
			var f = this._firstDefined;

			return {
				GatePassReqNo: f(oRaw.GatePassReqNo, oRaw.GatePassreqNo),
				GatePassType: f(oRaw.GatePassType),
				Plant: f(oRaw.Plant),
				FiscalYear: f(oRaw.FiscalYear, oRaw.Gjahr, oRaw.FisYear, String(new Date().getFullYear())),
				Department: f(oRaw.Department),
				Requestor: f(oRaw.ReqUser, oRaw.Requser, oRaw.requser, oRaw.Requestor, oRaw.RequestedUser),
				CommonDesc: f(oRaw.CommonDesc, oRaw.RGPCoomonDesc),

				GpDate: f(oRaw.GpDate, oRaw.Gpdate, oRaw.GPDate, oRaw.GatePassDate,
					oRaw.GatepassDate, oRaw.RequestDate, oRaw.Requestdate,
					oRaw.CreateDate, oRaw.CreatedOn, oRaw.Erdat, oRaw.Aedat),
				ReturnableDate: f(oRaw.ReturnableDate, oRaw.Returnabledate),

				VendorName: f(oRaw.VendorName, oRaw.Vendor1, oRaw.Name1),
				VendorGST: f(oRaw.VendorGST, oRaw.VendorGst, oRaw.TaxNo),
				City: f(oRaw.City, oRaw.City1),
				ZipCode: f(oRaw.ZipCode, oRaw.Pstlz),

				VehicleNo: f(oRaw.VehicleNo, oRaw.Vehicle, oRaw.Vehicleno),
				ModeOfDispatch: f(oRaw.ModeOfDispatch, oRaw.ModeDispatch, oRaw.TransportMode),
				Remarks: f(oRaw.Remarks, oRaw.Remark),
				HODRemarks: f(oRaw.HODRemarks, oRaw.HodRemarks),
				CoCode: f(oRaw.CoCode, oRaw.Cocode),
				ApprovalReq: f(oRaw.ApprovalReq),
				Approval2: f(oRaw.Approval2),
				Vendor: f(oRaw.Vendor),

				// Attachment 1
				Base64Img1: f(oRaw.Base64Img1, oRaw.Base64img1),
				Fname1: f(oRaw.FILENAME, oRaw.Filename, oRaw.FileName, oRaw.Fname),
				Ftype1: f(oRaw.FILETYPE, oRaw.Filetype, oRaw.FileType, oRaw.Ftype),

				// Attachment 2
				Base64Img2: f(oRaw.Base64Img2, oRaw.Base64img2),
				Fname2: f(oRaw.FILENAME2, oRaw.Filename2, oRaw.FileName2, oRaw.Fname2),
				Ftype2: f(oRaw.FILETYPE2, oRaw.Filetype2, oRaw.FileType2, oRaw.Ftype2),

				// Line items — expanded navigation property, also inconsistent casing
				Items: ((oRaw.GateReqItmNav && oRaw.GateReqItmNav.results) ||
					(oRaw.GateReqItemNav && oRaw.GateReqItemNav.results) || [])
			};
		},

		// =========================================================================
		// 6) MAPPING: normalized OData row -> "hod" JSON model
		// =========================================================================

		/**
		 * Takes a raw OData row (whatever casing/shape it arrives in) and
		 * writes it into the "hod" model that the view is bound to.
		 */
		_mapData: function (oRawData) {
			// Keep the raw row around — _updateStatus needs the full original
			// payload later when building the approval request.
			this._oRawData = oRawData;
			var oRow = this._normalizeGateRow(oRawData);

			var oModel = this.getView().getModel("hod");

			var sStatus = this._deriveStatus(oRawData);

			oModel.setProperty("/GatePassReqNo", oRow.GatePassReqNo);
			oModel.setProperty("/GatePassType", oRow.GatePassType);
			oModel.setProperty("/Status", sStatus);

			oModel.setProperty("/GpDate", this._formatDate(oRow.GpDate) || this._formatDate(new Date()));
			oModel.setProperty("/ReturnableDate", this._formatDate(oRow.ReturnableDate));

			oModel.setProperty("/Plant", oRow.Plant);
			oModel.setProperty("/FiscalYear", oRow.FiscalYear);
			oModel.setProperty("/Department", oRow.Department);

			oModel.setProperty("/VendorName", oRow.VendorName);
			oModel.setProperty("/VendorGST", oRow.VendorGST);
			oModel.setProperty("/VendorAddress", [oRow.City, oRow.ZipCode].filter(Boolean).join(", "));

			oModel.setProperty("/VehicleNo", oRow.VehicleNo);
			oModel.setProperty("/ModeOfDispatch", oRow.ModeOfDispatch);
			oModel.setProperty("/Remarks", oRow.Remarks);
			oModel.setProperty("/HODRemarks", oRow.HODRemarks);

			this._mapAttachments(oRow, oModel);
			this._mapLineItems(oRow.Items, oModel);
		},

		/**
		 * Writes both attachment slots (1 and 2) into the model using one
		 * shared helper function — no copy-pasted per-attachment logic.
		 */
		_mapAttachments: function (oRow, oModel) {
			this._mapSingleAttachment(oModel, oRow.Base64Img1, oRow.Fname1, oRow.Ftype1, {
				base64Prop: "/Base64Img1", hasProp: "/hasAttachment1",
				fnameProp: "/Fname", ftypeProp: "/Ftype",
				isImageProp: "/isImage1", isPdfProp: "/isPdf1",
				fallbackLabel: "attachment1"
			});

			this._mapSingleAttachment(oModel, oRow.Base64Img2, oRow.Fname2, oRow.Ftype2, {
				base64Prop: "/Base64Img2", hasProp: "/hasAttachment2",
				fnameProp: "/Fname2", ftypeProp: "/Ftype2",
				isImageProp: "/isImage2", isPdfProp: "/isPdf2",
				fallbackLabel: "attachment2"
			});

			oModel.setProperty("/hasAttachment", !!(oRow.Base64Img1 || oRow.Base64Img2));
		},

		/**
		 * Maps ONE attachment slot. `oPropMap` tells this function which model
		 * property names to write to, so the same function works for both
		 * attachment 1 and attachment 2 despite their slightly different
		 * naming convention (Fname vs Fname2, etc.)
		 */
		_mapSingleAttachment: function (oModel, sRawBase64, sRawFname, sRawFtype, oPropMap) {
			if (!sRawBase64) {
				oModel.setProperty(oPropMap.base64Prop, "");
				oModel.setProperty(oPropMap.hasProp, false);
				oModel.setProperty(oPropMap.fnameProp, "");
				oModel.setProperty(oPropMap.ftypeProp, "");
				oModel.setProperty(oPropMap.isImageProp, false);
				oModel.setProperty(oPropMap.isPdfProp, false);
				return;
			}

			// Prefer the file type the backend told us; fall back to sniffing
			// the actual bytes if the backend field was empty.
			var sFtype = this._normalizeFileTypeCode(sRawFtype) || this._detectFileType(sRawBase64);
			var sDisplayFname = this._buildDisplayFilename(sRawFname, sFtype, oPropMap.fallbackLabel);
			var bIsImage = !sFtype || ["JPG", "JPEG", "PNG", "GIF"].indexOf(sFtype) !== -1;

			oModel.setProperty(oPropMap.base64Prop, this._toBlobDataUrl(sRawBase64));
			oModel.setProperty(oPropMap.hasProp, true);
			oModel.setProperty(oPropMap.fnameProp, sDisplayFname);
			oModel.setProperty(oPropMap.ftypeProp, sFtype);
			oModel.setProperty(oPropMap.isImageProp, bIsImage);
			oModel.setProperty(oPropMap.isPdfProp, sFtype === "PDF");
		},

		/**
		 * Maps the expanded line items (GateReqItmNav) into a clean array
		 * for the table, and calculates the total.
		 */
		_mapLineItems: function (aRawItems, oModel) {
			var aItems = (aRawItems || []).map(function (oItem, iIndex) {
				var fQty = parseFloat(oItem.RequestedQuantity || oItem.Quantity || 0);
				var fRate = parseFloat(oItem.ItemNetPrice || 0);
				var fAmount = parseFloat(oItem.Totalvalue || (fQty * fRate).toFixed(2));

				return {
					sno: iIndex + 1,
					materialName: oItem.MaterialDesc || oItem.HSNDesc || oItem.Description || "",
					hsnCode: oItem.HSNCode || "",
					uom: oItem.UOM || "",
					quantity: fQty,
					rate: fRate,
					amount: fAmount
				};
			});

			var fTotal = aItems.reduce(function (fSum, oItem) {
				return fSum + parseFloat(oItem.amount || 0);
			}, 0);

			oModel.setProperty("/items", aItems);
			oModel.setProperty("/totalAmount", fTotal.toLocaleString("en-IN", {
				minimumFractionDigits: 2,
				maximumFractionDigits: 2
			}));
		},

		// =========================================================================
		// 7) ATTACHMENT FILE UTILS (pure functions — no UI, no model access)
		// =========================================================================

		/** Maps a raw/guessed type string down to the short code the UI uses. */
		_normalizeFileTypeCode: function (sRawType) {
			var sType = (sRawType || "").toUpperCase().trim();
			if (!sType) { return ""; }

			if (sType.indexOf("PDF") !== -1) { return "PDF"; }
			if (sType.indexOf("PNG") !== -1) { return "PNG"; }
			if (sType.indexOf("JPG") !== -1 || sType.indexOf("JPEG") !== -1) { return "JPG"; }
			if (sType.indexOf("DOC") !== -1 || sType.indexOf("WORD") !== -1 || sType.indexOf("OFFICEDOCUMENT") !== -1) { return "DOCX"; }

			return sType; // unknown — return as-is rather than silently dropping it
		},

		/**
		 * Peeks at the actual file bytes (via Base64/Hex prefix matching)
		 * to guess a file's type when the backend's type field is empty.
		 */
		_detectFileType: function (sRawImg) {
			if (!sRawImg) { return ""; }

			var sClean = sRawImg.trim().replace(/[\n\r\s]/g, "");
			var iComma = sClean.indexOf("base64,");
			var sBody = iComma !== -1 ? sClean.substring(iComma + 7) : sClean;

			for (var i = 0; i < BASE64_SIGNATURES.length; i++) {
				if (sBody.indexOf(BASE64_SIGNATURES[i].marker) !== -1) {
					return this._normalizeFileTypeCode(BASE64_SIGNATURES[i].mime);
				}
			}

			var sPossibleHex = sBody.replace(/^0x/i, "").toUpperCase();
			for (var j = 0; j < HEX_SIGNATURES.length; j++) {
				if (sPossibleHex.indexOf(HEX_SIGNATURES[j].hex) !== -1) {
					return this._normalizeFileTypeCode(HEX_SIGNATURES[j].mime);
				}
			}

			return ""; // couldn't figure it out
		},

		/**
		 * Some SAP RAW/XSTRING fields come back as pure hex text instead of
		 * Base64. Converts hex -> byte array -> Base64, in memory-safe
		 * chunks (browsers choke on giant single-shot btoa() calls).
		 */
		_hexToBase64DataUrl: function (sPossibleHex) {
			var upperImg = sPossibleHex.toUpperCase();

			// Find where the "real" file content starts — SAP sometimes
			// prefixes hex payloads with padding/garbage before the actual
			// file signature.
			var startIndex = 0;
			var mimeType = "image/jpeg"; // sensible default

			var aMatches = HEX_SIGNATURES
				.map(function (sig) { return { mime: sig.mime, idx: upperImg.indexOf(sig.hex) }; })
				.filter(function (m) { return m.idx !== -1; })
				.sort(function (a, b) { return a.idx - b.idx; }); // earliest match wins

			if (aMatches.length > 0) {
				startIndex = aMatches[0].idx;
				mimeType = aMatches[0].mime;
			}

			var actualHex = upperImg.substring(startIndex);
			if (actualHex.length % 2 !== 0) {
				// Hex needs an even number of chars (2 chars = 1 byte).
				// Trim a stray trailing char rather than crash.
				actualHex = actualHex.substring(0, actualHex.length - 1);
			}

			var numBytes = actualHex.length / 2;
			var byteArray = new Uint8Array(numBytes);
			for (var i = 0; i < numBytes; i++) {
				byteArray[i] = parseInt(actualHex.substr(i * 2, 2), 16);
			}

			// Convert to Base64 in small chunks to avoid memory/call-stack
			// issues with very large files (multi-MB PDFs etc.)
			var CHUNK_SIZE = 3072;
			var sBase64 = "";
			for (var offset = 0; offset < byteArray.length; offset += CHUNK_SIZE) {
				var slice = byteArray.subarray(offset, offset + CHUNK_SIZE);
				var sBinaryChunk = "";
				for (var k = 0; k < slice.length; k++) {
					sBinaryChunk += String.fromCharCode(slice[k]);
				}
				sBase64 += btoa(sBinaryChunk);
			}

			return "data:" + mimeType + ";base64," + sBase64;
		},

		/**
		 * MAIN ENTRY POINT for attachment display.
		 * Takes whatever the backend gave us (hex string, raw Base64, or an
		 * already-formed data: URL) and always returns a proper
		 * "data:<mime>;base64,<data>" string that <Image>/<a download> can use.
		 */
		_toBlobDataUrl: function (sRawImg) {
			var sImg = (sRawImg || "").replace(/[\n\r\s]/g, "");
			if (!sImg || sImg.length < 50) { return ""; } // too short to be a real file

			// --- Attempt 1: is this a HEX-encoded payload? ---
			var sPossibleHex = sImg.replace(/^0x/i, "");
			var bIsHex = /^[0-9A-Fa-f]+$/.test(sPossibleHex);

			if (bIsHex && sPossibleHex.length >= 50) {
				try {
					return this._hexToBase64DataUrl(sPossibleHex);
				} catch (eHex) {
					// If hex parsing fails, fall through and try plain Base64 instead
					// rather than crashing the screen.
				}
			}

			// --- Attempt 2: treat it as plain Base64 text ---
			var sBase64 = sImg.replace(/ /g, "+"); // spaces sometimes creep in for "+" during transport

			if (sBase64.indexOf("data:") === 0) {
				return sBase64; // already a full data URL
			}

			for (var i = 0; i < BASE64_SIGNATURES.length; i++) {
				var iMatch = sBase64.indexOf(BASE64_SIGNATURES[i].marker);
				if (iMatch !== -1) {
					return "data:" + BASE64_SIGNATURES[i].mime + ";base64," + sBase64.substring(iMatch);
				}
			}

			// --- Last resort: assume JPEG ---
			return "data:image/jpeg;base64," + sBase64;
		},

		/** Ensures the filename shown to the user always has a sensible extension. */
		_buildDisplayFilename: function (sRawFilename, sFileTypeCode, sFallbackLabel) {
			var sName = sRawFilename || "";

			if (sName) {
				var bHasExtension = sName.indexOf(".") !== -1;
				if (!bHasExtension && sFileTypeCode) {
					sName += "." + sFileTypeCode.toLowerCase();
				}
				return sName;
			}

			if (sFileTypeCode) {
				return sFallbackLabel + "." + sFileTypeCode.toLowerCase();
			}
			return "";
		},

		// =========================================================================
		// 8) ATTACHMENT UI ACTIONS (preview dialog, download)
		// =========================================================================

		/** Opens a full-screen preview dialog when an attachment thumbnail is tapped. */
		onImagePress: function (oEvent) {
			var sSrc = oEvent.getSource().getSrc();
			if (!sSrc) { return; }

			if (!this._oImageDialog) {
				this._oImageDialog = new sap.m.Dialog({
					title: "Attachment Preview",
					stretch: true,
					content: new sap.m.Image({ src: sSrc, width: "100%", densityAware: false }),
					endButton: new sap.m.Button({
						text: "Close",
						press: function () { this._oImageDialog.close(); }.bind(this)
					})
				});
				this.getView().addDependent(this._oImageDialog);
			} else {
				this._oImageDialog.getContent()[0].setSrc(sSrc);
			}

			this._oImageDialog.open();
		},

		onDownloadAttachment1: function () {
			this._downloadAttachmentFile(1);
		},

		onDownloadAttachment2: function () {
			this._downloadAttachmentFile(2);
		},

		/**
		 * Converts the Base64 data URL currently in the model back into a
		 * Blob and triggers a browser download (or opens PDFs in a new tab).
		 */
		_downloadAttachmentFile: function (iIndex) {
			var oModel = this.getView().getModel("hod");
			var sNameSuffix = iIndex === 2 ? "2" : "";

			var sBase64DataUrl = oModel.getProperty("/Base64Img" + iIndex);
			var sFilename = oModel.getProperty("/Fname" + sNameSuffix) || ("Attachment_" + iIndex);
			var sFtype = (oModel.getProperty("/Ftype" + sNameSuffix) || "JPG").toUpperCase();

			if (!sBase64DataUrl) { return; }

			var sMimeType = this._mimeTypeForFtype(sFtype);
			var sPureBase64 = sBase64DataUrl.indexOf("base64,") !== -1
				? sBase64DataUrl.split("base64,")[1]
				: sBase64DataUrl;

			try {
				var oBlob = this._base64ToBlob(sPureBase64, sMimeType);
				var sFilenameWithExt = sFilename.indexOf(".") === -1
					? sFilename + "." + sFtype.toLowerCase()
					: sFilename;

				this._triggerBrowserDownload(oBlob, sFilenameWithExt, sFtype);
			} catch (e) {
				MessageBox.error("Failed to open or download attachment: " + e.message);
			}
		},

		_mimeTypeForFtype: function (sFtype) {
			var oMimeMap = {
				PDF: "application/pdf",
				DOCX: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
				DOC: "application/msword",
				PNG: "image/png"
			};
			return oMimeMap[sFtype] || "image/jpeg";
		},

		_base64ToBlob: function (sPureBase64, sMimeType) {
			var sBinary = atob(sPureBase64);
			var aBytes = new Uint8Array(sBinary.length);
			for (var i = 0; i < sBinary.length; i++) {
				aBytes[i] = sBinary.charCodeAt(i);
			}
			return new Blob([aBytes], { type: sMimeType });
		},

		_triggerBrowserDownload: function (oBlob, sFilename, sFtype) {
			// Old IE / Edge legacy support
			if (window.navigator && window.navigator.msSaveOrOpenBlob) {
				window.navigator.msSaveOrOpenBlob(oBlob, sFilename);
				return;
			}

			var sObjectUrl = window.URL.createObjectURL(oBlob);

			if (sFtype === "PDF") {
				// PDFs open in a new tab for inline viewing rather than forcing a download
				window.open(sObjectUrl, "_blank");
			} else {
				var oLink = document.createElement("a");
				oLink.href = sObjectUrl;
				oLink.download = sFilename;
				document.body.appendChild(oLink);
				oLink.click();
				document.body.removeChild(oLink);
			}

			// Free the memory the browser allocated for this blob URL.
			// Small delay so the click/open has time to actually start.
			window.setTimeout(function () {
				window.URL.revokeObjectURL(sObjectUrl);
			}, 1000);
		},

		_getRawBase64FromModel: function (sDataUrl) {
			if (!sDataUrl) { return ""; }
			var iComma = sDataUrl.indexOf("base64,");
			return iComma !== -1 ? sDataUrl.substring(iComma + 7) : sDataUrl;
		},

		// =========================================================================
		// 9) APPROVE / REJECT / AMEND WORKFLOW
		// =========================================================================

		onApprove: function () {
			var sRemarks = this.getView().getModel("hod").getProperty("/HODRemarks") || "";
			var that = this;

			MessageBox.confirm("Approve this Gate Pass Request?", {
				title: "Confirm Approval",
				onClose: function (sAction) {
					if (sAction === MessageBox.Action.OK) {
						that._updateStatus("A1", "Store Approval Pending", sRemarks);
					}
				}
			});
		},

		onReject: function () {
			var sRemarks = this.getView().getModel("hod").getProperty("/HODRemarks") || "";
			var that = this;

			MessageBox.confirm("Reject this Gate Pass Request?", {
				title: "Confirm Rejection",
				onClose: function (sAction) {
					if (sAction === MessageBox.Action.OK) {
						that._updateStatus("R", "Rejected", sRemarks);
					}
				}
			});
		},

		/** Opens a small dialog asking the HOD to type a reason before submitting an amendment. */
		onAmend: function () {
			var that = this;

			if (this._oAmendDialog) {
				this._oAmendDialog.open();
				return;
			}

			// Local reference instead of a hardcoded global ID — avoids ID
			// collisions if this view is ever instantiated more than once
			// (e.g. split-screen / Flexible Column Layout).
			var oReasonInput = new sap.m.TextArea({
				width: "100%",
				placeholder: "Enter reason here...",
				rows: 4,
				liveChange: function (oEvent) {
					var sText = oEvent.getParameter("value");
					that._oAmendDialog.getBeginButton().setEnabled(sText.trim().length > 0);
				}
			});

			this._oAmendDialog = new sap.m.Dialog({
				title: "Amendment Reason",
				type: sap.m.DialogType.Message,
				content: [
					new sap.m.Label({ text: "Please enter the reason for Amendment:", required: true }),
					oReasonInput
				],
				beginButton: new sap.m.Button({
					type: sap.m.ButtonType.Emphasized,
					text: "Submit",
					enabled: false,
					press: function () {
						var sReason = oReasonInput.getValue().trim();
						that._oAmendDialog.close();
						that._updateStatus("AM", "Amendment", sReason);
					}
				}),
				endButton: new sap.m.Button({
					text: "Cancel",
					press: function () { that._oAmendDialog.close(); }
				}),
				afterClose: function () {
					that._oAmendDialog.destroy();
					that._oAmendDialog = null;
				}
			});

			this.getView().addDependent(this._oAmendDialog);
			this._oAmendDialog.open();
		},

		/**
		 * Sends the approval/rejection/amendment decision back to SAP.
		 * Rebuilds the FULL original payload (not just the status field)
		 * because the backend's CREATE_ENTITY handler expects the complete
		 * request structure, matching how it was originally created.
		 */
		_updateStatus: function (sApprovalCode, sDisplayStatus, sRemarks) {
			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) {
				MessageBox.error("SAP system is not connected.");
				return;
			}

			var that = this;
			BusyIndicator.show(0);

			var oPayload = this._buildApprovalPayload(oODataModel, sApprovalCode, sRemarks);

			oODataModel.create("/GatePassReqHdrSet", oPayload, {
				success: function (oData) {
					BusyIndicator.hide();
					that.getView().getModel("hod").setProperty("/Status", sDisplayStatus);

					var sMsg = (oData && oData.Message) || ("Request " + sDisplayStatus + " successfully.");
					MessageBox.success(sMsg, {
						onClose: function () { that.getRouter().navTo("GatePassList"); }
					});
				},
				error: function (oError) {
					BusyIndicator.hide();
					MessageBox.error(that._extractODataErrorMessage(oError));
				}
			});
		},

		/**
		 * Builds the full create-payload from the last-loaded raw row plus
		 * the new approval decision. Field-name lookups against service
		 * metadata (_buildMetadataPropertyFinder) handle the same backend
		 * casing inconsistency as everywhere else in this file.
		 */
		_buildApprovalPayload: function (oODataModel, sApprovalCode, sRemarks) {
			var oRow = this._normalizeGateRow(this._oRawData || {});
			var oHodModel = this.getView().getModel("hod");

			// Strip file extensions before sending — the backend stores
			// filename and type as separate fields.
			var sFname1 = this._stripExtension(oHodModel.getProperty("/Fname") || "");
			var sFname2 = this._stripExtension(oHodModel.getProperty("/Fname2") || "");

			var oPayload = {
				GatePassType: oRow.GatePassType || this._sType,
				Cocode: oRow.CoCode,
				Plant: oRow.Plant,
				FiscalYear: oRow.FiscalYear,
				GpDate: oRow.GpDate,
				Vendor: oRow.Vendor,
				VendorName: oRow.VendorName,
				VendorGST: oRow.VendorGST,
				ZipCode: oRow.ZipCode,
				City: oRow.City,
				ApprovalReq: sApprovalCode === "AM" ? "AM" : oRow.ApprovalReq,
				Approval1: sApprovalCode === "AM" ? "" : sApprovalCode,
				Approval2: sApprovalCode === "AM" ? "" : oRow.Approval2,
				StoreAmmend: "",
				Department: oRow.Department,
				VehicleNo: oRow.VehicleNo,
				ModeOfDispatch: oRow.ModeOfDispatch,
				Remarks: oRow.Remarks,
				ReturnableDate: oRow.ReturnableDate,
				HODRemarks: sRemarks || "",
				GatePassReqNo: this._sReqNo,
				GateReqItemNav: oRow.Items.map(function (oItem) {
					return {
						GatePassType: oItem.GatePassType || "",
						ItemNo: oItem.ItemNo || "",
						Material: oItem.Material || "",
						MaterialDesc: oItem.MaterialDesc || "",
						HSNCode: oItem.HSNCode || "",
						HSNDesc: oItem.HSNDesc || "",
						UOM: oItem.UOM || "",
						ItemNetPrice: oItem.ItemNetPrice || "0.00",
						RequestedQuantity: oItem.RequestedQuantity || "0.000",
						Totalvalue: oItem.Totalvalue || "0.00",
						Remarks: oItem.Remarks || ""
					};
				})
			};

			// Attach the file fields using whatever property names the
			// service metadata actually defines (handles casing drift).
			var fnFindProp = this._buildMetadataPropertyFinder(oODataModel);

			oPayload[fnFindProp("Base64Img1", "Base64img1") || "Base64Img1"] =
				this._getRawBase64FromModel(oHodModel.getProperty("/Base64Img1"));
			oPayload[fnFindProp("FILENAME", "Filename", "FileName", "Fname") || "Fname"] = sFname1;
			oPayload[fnFindProp("FILETYPE", "Filetype", "FileType", "Ftype") || "Ftype"] =
				oHodModel.getProperty("/Ftype") || "";

			oPayload[fnFindProp("Base64Img2", "Base64img2") || "Base64Img2"] =
				this._getRawBase64FromModel(oHodModel.getProperty("/Base64Img2"));
			oPayload[fnFindProp("FILENAME2", "Filename2", "FileName2", "Fname2") || "Fname2"] = sFname2;
			oPayload[fnFindProp("FILETYPE2", "Filetype2", "FileType2", "Ftype2") || "Ftype2"] =
				oHodModel.getProperty("/Ftype2") || "";

			return oPayload;
		},

		_stripExtension: function (sFilename) {
			var iDot = sFilename.lastIndexOf(".");
			return iDot !== -1 ? sFilename.substring(0, iDot) : sFilename;
		},

		/**
		 * Returns a lookup function that checks the OData $metadata document
		 * for the "GatePassReqHdr" entity type and finds the real property
		 * name for a list of candidate names (case-insensitive fallback).
		 */
		_buildMetadataPropertyFinder: function (oODataModel) {
			var oMetadata = oODataModel.getServiceMetadata();
			var aEntityProperties = [];

			if (oMetadata && oMetadata.dataServices && oMetadata.dataServices.schema) {
				oMetadata.dataServices.schema.forEach(function (oSchema) {
					(oSchema.entityType || []).forEach(function (oEntityType) {
						if (oEntityType.name && oEntityType.name.indexOf("GatePassReqHdr") !== -1) {
							aEntityProperties = aEntityProperties.concat(oEntityType.property || []);
						}
					});
				});
			}

			return function findProperty() {
				var aCandidates = Array.prototype.slice.call(arguments);
				for (var i = 0; i < aCandidates.length; i++) {
					var oExactMatch = aEntityProperties.find(function (p) { return p.name === aCandidates[i]; });
					if (oExactMatch) { return oExactMatch.name; }

					var oCaseInsensitiveMatch = aEntityProperties.find(function (p) {
						return p.name.toLowerCase() === aCandidates[i].toLowerCase();
					});
					if (oCaseInsensitiveMatch) { return oCaseInsensitiveMatch.name; }
				}
				return null;
			};
		},

		_extractODataErrorMessage: function (oError) {
			var sDefaultMsg = "Failed to update request status.";
			try {
				var oBody = JSON.parse(oError.responseText);
				var aDetails = oBody.error && oBody.error.innererror && oBody.error.innererror.errordetails;

				if (aDetails && aDetails[0]) { return aDetails[0].message; }
				if (oBody.error && oBody.error.message && oBody.error.message.value) {
					return oBody.error.message.value;
				}
			} catch (e) {
				// Response wasn't valid JSON — fall through to default message
			}
			return sDefaultMsg;
		},

		// =========================================================================
		// 10) NAVIGATION
		// =========================================================================

		onNavBack: function () {
			this.getRouter().navTo("GatePassList");
		}

	});
});