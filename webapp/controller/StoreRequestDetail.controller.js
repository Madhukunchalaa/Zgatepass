sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/m/MessageBox",
	"sap/m/MessageToast",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/base/security/URLListValidator"
], function (BaseController, JSONModel, MessageBox, MessageToast, Filter, FilterOperator, URLListValidator) {
	"use strict";

	return BaseController.extend("zgpms.meilpower.com.controller.StoreRequestDetail", {

		onInit: function () {
			try {
				URLListValidator.add("data");
			} catch (e) {
				try { jQuery.sap.addUrlWhitelist("data"); } catch (e2) { /* ignore */ }
			}
			this._resetModel();
			this.getRouter().getRoute("StoreRequestDetail").attachPatternMatched(this._onRouteMatched, this);
		},

		_onRouteMatched: function (oEvent) {
			this._resetModel();
			var oArgs    = oEvent.getParameter("arguments");
			this._sReqNo = decodeURIComponent(oArgs.reqNo  || "");
			this._sType  = decodeURIComponent(oArgs.gpType || "NRGP");

			var oTemp = this.getOwnerComponent().getModel("storeTemp");
			if (oTemp) {
				var oRow = oTemp.getData();
				if (oRow && (oRow.GatePassReqNo === this._sReqNo || oRow.GatePassreqNo === this._sReqNo)) {
					this._mapData(oRow);
				}
			}

			if (this._sReqNo) {
				this._loadDetail(this._sReqNo, this._sType);
			}
		},

		_resetModel: function () {
			var oData = {
				GatePassReqNo: "", GatePassType: "", Status: "",
				GpDate: "", Plant: "", FiscalYear: "", Department: "",
				VendorName: "", VendorGST: "", VendorAddress: "",
				DueDate: "",
				VehicleNo: "", ModeOfDispatch: "", Remarks: "",
				HODRemarks: "", STORERemarks: "", totalAmount: "0.00",
				items: [], Base64Img1: "", Fname: "", Ftype: "", hasAttachment1: false, isImage1: false, isPdf1: false,
				Base64Img2: "", Fname2: "", Ftype2: "", hasAttachment2: false, isImage2: false, isPdf2: false,
				hasAttachment: false
			};
			var oModel = this.getView().getModel("store");
			if (oModel) { oModel.setData(oData); } else { this.getView().setModel(new JSONModel(oData), "store"); }
		},

		_loadDetail: function (sReqNo, sType) {
			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) { return; }
			var that = this;

			sap.ui.core.BusyIndicator.show(0);
			oODataModel.read("/GateReqHdrSet", {
				filters: [
					new Filter("GatePassReqNo", FilterOperator.EQ, sReqNo),
					new Filter("GatePassType",  FilterOperator.EQ, sType)
				],
				urlParameters: { "$expand": "GateReqItmNav" },
				success: function (oData) {
					sap.ui.core.BusyIndicator.hide();
					var oItem = (oData.results || [])[0];
					if (oItem) {
						that._mapData(oItem);
						// If HODRemarks is empty from GateReqHdrSet, fetch from creation entity
						var sHOD = oItem.HODRemarks || oItem.HodRemarks || "";
						if (!sHOD) {
							that._loadHODRemarks(sReqNo, sType);
						}
						// Fetch image from creation entity if missing
						var sCheckImg1 = oItem.Base64Img1 || oItem.Base64img1 || "";
						var sCheckImg2 = oItem.Base64Img2 || oItem.Base64img2 || "";
						if (!sCheckImg1 || !sCheckImg2) {
							that._loadBase64(sReqNo, sType);
						}
					} else {
						that._loadFromList(sReqNo, sType);
					}
				},
				error: function () {
					sap.ui.core.BusyIndicator.hide();
					that._loadFromList(sReqNo, sType);
				}
			});
		},

		// Fetch HODRemarks from GatePassReqHdrSet when GateReqHdrSet doesn't return them
		_loadHODRemarks: function (sReqNo, sType) {
			var oODataModel = this.getOwnerComponent().getModel();
			var oStoreModel = this.getView() && this.getView().getModel("store");
			if (!oODataModel || !oStoreModel) { return; }

			var that = this;
			var sKeyPath = "/GatePassReqHdrSet(GatePassReqNo='" + sReqNo + "',GatePassType='" + sType + "')";
			
			oODataModel.read(sKeyPath, {
				success: function (oData) {
					if (oData) {
						var sHOD = oData.HODRemarks || oData.HodRemarks || "";
						if (sHOD) {
							oStoreModel.setProperty("/HODRemarks", sHOD);
							if (that._oRawData) { that._oRawData.HODRemarks = sHOD; }
							return;
						}
					}
					that._loadHODRemarksByFilter(sReqNo, sType);
				},
				error: function (oError) {
					console.log("Direct key read for HODRemarks failed, trying filter", oError);
					that._loadHODRemarksByFilter(sReqNo, sType);
				}
			});
		},

		_loadHODRemarksByFilter: function (sReqNo, sType) {
			var oODataModel = this.getOwnerComponent().getModel();
			var oStoreModel = this.getView() && this.getView().getModel("store");
			if (!oODataModel || !oStoreModel) { return; }

			var aFilters = [new Filter("GatePassReqNo", FilterOperator.EQ, sReqNo)];
			if (sType) { aFilters.push(new Filter("GatePassType", FilterOperator.EQ, sType)); }

			var that = this;
			oODataModel.read("/GatePassReqHdrSet", {
				filters: aFilters,
				success: function (oData) {
					var oItem = oData.results && oData.results[0];
					if (oItem) {
						var sHOD = oItem.HODRemarks || oItem.HodRemarks || "";
						if (sHOD) {
							oStoreModel.setProperty("/HODRemarks", sHOD);
							if (that._oRawData) {
								that._oRawData.HODRemarks = sHOD;
							}
						}
					}
				},
				error: function (oError) {
					console.error("Filter read for HODRemarks failed", oError);
				}
			});
		},

		_loadFromList: function (sReqNo, sType) {
			var oODataModel = this.getOwnerComponent().getModel();
			var that = this;
			sap.ui.core.BusyIndicator.show(0);

			oODataModel.read("/GateReqHdrSet", {
				filters: [
					new Filter("GatePassType", FilterOperator.EQ, sType),
					new Filter("Status",       FilterOperator.EQ, "All")
				],
				urlParameters: { "$expand": "GateReqItmNav" },
				success: function (oData) {
					sap.ui.core.BusyIndicator.hide();
					var oItem = (oData.results || []).find(function (r) {
						return (r.GatePassReqNo === sReqNo) || (r.GatePassreqNo === sReqNo);
					});
					if (oItem) { 
						that._mapData(oItem); 
						// If HODRemarks is empty, fetch from creation entity
						var sHOD = oItem.HODRemarks || oItem.HodRemarks || "";
						if (!sHOD) {
							that._loadHODRemarks(sReqNo, sType);
						}
						// Fetch image from creation entity if missing
						var sCheckImg1 = oItem.Base64Img1 || oItem.Base64img1 || "";
						var sCheckImg2 = oItem.Base64Img2 || oItem.Base64img2 || "";
						if (!sCheckImg1 || !sCheckImg2) {
							that._loadBase64(sReqNo, sType);
						}
					}
				},
				error: function () { sap.ui.core.BusyIndicator.hide(); }
			});
		},

		// Fetch Base64 attachments from GatePassReqHdrSet (creation entity stores the image)
		_loadBase64: function (sReqNo, sType) {
			var oODataModel = this.getOwnerComponent().getModel();
			var oStoreModel   = this.getView() && this.getView().getModel("store");
			if (!oODataModel || !oStoreModel) { return; }
			var that = this;

			// Attempt direct key read (same 3-field key format)
			var sKeyPath = "/GatePassReqHdrSet(GatePassReqNo='" + sReqNo + "',GatePassType='" + sType + "')";
			oODataModel.read(sKeyPath, {
				success: function (oData) {
					if (oData && (oData.Base64Img1 || oData.Base64img1 || oData.Base64Img2 || oData.Base64img2)) {
						that._processLoadedAttachments(oData, oStoreModel);
					} else {
						// Image empty in direct read, try filter
						that._loadBase64ByFilter(sReqNo);
					}
				},
				error: function (oError) {
					console.error("Direct OData read on " + sKeyPath + " failed. Trying filter query.", oError);
					// Key read unsupported or failed — try filter approach
					that._loadBase64ByFilter(sReqNo);
				}
			});
		},

		_loadBase64ByFilter: function (sReqNo) {
			var oODataModel = this.getOwnerComponent().getModel();
			var oStoreModel   = this.getView() && this.getView().getModel("store");
			if (!oODataModel || !oStoreModel) { return; }
			var that = this;

			oODataModel.read("/GatePassReqHdrSet", {
				filters: [new Filter("GatePassReqNo", FilterOperator.EQ, sReqNo)],
				success: function (oData) {
					var oItem = oData.results && oData.results[0];
					if (oItem && (oItem.Base64Img1 || oItem.Base64img1 || oItem.Base64Img2 || oItem.Base64img2)) {
						that._processLoadedAttachments(oItem, oStoreModel);
					} else {
						console.log("No attachment found in GatePassReqHdrSet via filter for request " + sReqNo);
					}
				},
				error: function (oError) {
					console.error("Filter OData read on /GatePassReqHdrSet failed: ", oError);
				}
			});
		},

		_processLoadedAttachments: function (oData, oModel) {
			if (!oData || !oModel) return;

			// Attachment 1
			var sImg1 = oData.Base64Img1 || oData.Base64img1 || "";
			var sFname1 = oData.FILENAME || oData.Filename || oData.FileName || oData.Fname || "";
			var sFtype1 = (oData.FILETYPE || oData.Filetype || oData.FileType || oData.Ftype || "").toUpperCase().trim();

			if (sImg1) {
				oModel.setProperty("/Base64Img1", this._formatBase64ToBlobUrl(sImg1));
				oModel.setProperty("/hasAttachment1", true);
				if (!sFtype1) {
					sFtype1 = this._detectFileType(sImg1);
				}
				if (sFtype1) {
					sFtype1 = sFtype1.toUpperCase().trim();
					if (sFtype1.indexOf("PDF") !== -1 || sFtype1 === "APPLICATION/PDF") {
						sFtype1 = "PDF";
					} else if (sFtype1.indexOf("PNG") !== -1 || sFtype1 === "IMAGE/PNG") {
						sFtype1 = "PNG";
					} else if (sFtype1.indexOf("JPG") !== -1 || sFtype1.indexOf("JPEG") !== -1 || sFtype1 === "IMAGE/JPEG") {
						sFtype1 = "JPG";
					} else if (sFtype1.indexOf("DOC") !== -1 || sFtype1.indexOf("WORD") !== -1 || sFtype1.indexOf("OFFICEDOCUMENT") !== -1) {
						sFtype1 = "DOCX";
					}
				}
				var sDisplayFname1 = sFname1;
				if (sDisplayFname1) {
					if (sDisplayFname1.indexOf(".") === -1 && sFtype1) {
						sDisplayFname1 += "." + sFtype1.toLowerCase();
					}
				} else if (sFtype1) {
					sDisplayFname1 = "attachment1." + sFtype1.toLowerCase();
				}
				oModel.setProperty("/Fname", sDisplayFname1);
				oModel.setProperty("/Ftype", sFtype1);

				// UI5 safe helper properties
				var bIsImage1 = !sFtype1 || ["JPG", "JPEG", "PNG", "GIF"].indexOf(sFtype1) !== -1;
				var bIsPdf1 = sFtype1 === "PDF";
				oModel.setProperty("/isImage1", bIsImage1);
				oModel.setProperty("/isPdf1", bIsPdf1);
			} else {
				oModel.setProperty("/Base64Img1", "");
				oModel.setProperty("/hasAttachment1", false);
				oModel.setProperty("/Fname", "");
				oModel.setProperty("/Ftype", "");
				oModel.setProperty("/isImage1", false);
				oModel.setProperty("/isPdf1", false);
			}

			// Attachment 2
			var sImg2 = oData.Base64Img2 || oData.Base64img2 || "";
			var sFname2 = oData.FILENAME2 || oData.Filename2 || oData.FileName2 || oData.Fname2 || "";
			var sFtype2 = (oData.FILETYPE2 || oData.Filetype2 || oData.FileType2 || oData.Ftype2 || "").toUpperCase().trim();

			if (sImg2) {
				oModel.setProperty("/Base64Img2", this._formatBase64ToBlobUrl(sImg2));
				oModel.setProperty("/hasAttachment2", true);
				if (!sFtype2) {
					sFtype2 = this._detectFileType(sImg2);
				}
				if (sFtype2) {
					sFtype2 = sFtype2.toUpperCase().trim();
					if (sFtype2.indexOf("PDF") !== -1 || sFtype2 === "APPLICATION/PDF") {
						sFtype2 = "PDF";
					} else if (sFtype2.indexOf("PNG") !== -1 || sFtype2 === "IMAGE/PNG") {
						sFtype2 = "PNG";
					} else if (sFtype2.indexOf("JPG") !== -1 || sFtype2.indexOf("JPEG") !== -1 || sFtype2 === "IMAGE/JPEG") {
						sFtype2 = "JPG";
					} else if (sFtype2.indexOf("DOC") !== -1 || sFtype2.indexOf("WORD") !== -1 || sFtype2.indexOf("OFFICEDOCUMENT") !== -1) {
						sFtype2 = "DOCX";
					}
				}
				var sDisplayFname2 = sFname2;
				if (sDisplayFname2) {
					if (sDisplayFname2.indexOf(".") === -1 && sFtype2) {
						sDisplayFname2 += "." + sFtype2.toLowerCase();
					}
				} else if (sFtype2) {
					sDisplayFname2 = "attachment2." + sFtype2.toLowerCase();
				}
				oModel.setProperty("/Fname2", sDisplayFname2);
				oModel.setProperty("/Ftype2", sFtype2);

				// UI5 safe helper properties
				var bIsImage2 = !sFtype2 || ["JPG", "JPEG", "PNG", "GIF"].indexOf(sFtype2) !== -1;
				var bIsPdf2 = sFtype2 === "PDF";
				oModel.setProperty("/isImage2", bIsImage2);
				oModel.setProperty("/isPdf2", bIsPdf2);
			} else {
				oModel.setProperty("/Base64Img2", "");
				oModel.setProperty("/hasAttachment2", false);
				oModel.setProperty("/Fname2", "");
				oModel.setProperty("/Ftype2", "");
				oModel.setProperty("/isImage2", false);
				oModel.setProperty("/isPdf2", false);
			}

			oModel.setProperty("/hasAttachment", !!(sImg1 || sImg2));
		},

		_deriveStatus: function (oItem) {
			var fnGetProp = function (obj, sProp) {
				if (!obj) return "";
				var sTarget = sProp.toLowerCase();
				for (var key in obj) {
					if (key.toLowerCase() === sTarget) {
						return obj[key];
					}
				}
				return "";
			};

			var s1 = fnGetProp(oItem, "Approval1");
			if (!s1 || s1 === "null" || s1 === "undefined") s1 = "";
			s1 = String(s1).trim().toUpperCase();

			var s2 = fnGetProp(oItem, "Approval2");
			if (!s2 || s2 === "null" || s2 === "undefined") s2 = "";
			s2 = String(s2).trim().toUpperCase();

			var sStatus = fnGetProp(oItem, "Status");
			if (!sStatus || sStatus === "null" || sStatus === "undefined") sStatus = "";
			sStatus = String(sStatus).trim().toUpperCase();

			var sAppReq = fnGetProp(oItem, "ApprovalReq");
			sAppReq = String(sAppReq).trim().toUpperCase();

			var sAmmend = fnGetProp(oItem, "StoreAmmend");
			sAmmend = String(sAmmend || "").trim().toUpperCase();

			// 1. Rejected checks
			if (s1 === "R" || s2 === "R" || sAppReq === "R" || sStatus === "REJECTED") {
				return "Rejected";
			}

			// 2. Amendment checks
			if (sAmmend === "AM" || s1 === "AM" || s2 === "AM"  || sStatus === "AM" || sStatus === "AMENDMENT") {
				return "Amendment";
			}

			// 3. Approved checks (Store acted, or explicitly Approved)
			if (s2 || sStatus === "APPROVED") {
				return "Approved";
			}
			
			// If backend GET_ENTITYSET forgot Approval2 but returned STORERemarks, we can assume Store acted
			var sStoreRemarks = oItem.STORERemarks || oItem.StoreRemarks || "";
			if (sStoreRemarks && String(sStoreRemarks).trim() !== "" && String(sStoreRemarks) !== "null") {
				return "Approved";
			}

			// 4. Pending checks
			if (s1 && s1 !== "X" && s1 !== "PENDING" && !s2) {
				return "Store Approval Pending";
			}

			// Fallback checks
			if (sStatus === "STORE APPROVAL PENDING") return "Store Approval Pending";
			if (sStatus === "APPROVED") return "Approved";
			if (sStatus === "REJECTED") return "Rejected";
			if (sStatus === "AMENDMENT") return "Amendment";
			if (sStatus === "CAN" || sStatus === "CANCELLED") return "Cancelled";
			if (sStatus === "C"   || sStatus === "CLOSED")    return "Closed";

			return "Pending";
		},

		_mapData: function (oData) {
			this._oRawData = oData;

			var oModel  = this.getView().getModel("store");
			var sStatus = this._deriveStatus(oData);

			var sGpDate = this._formatDate(oData.GpDate || oData.Gpdate || oData.GPDate || oData.GatePassDate || oData.GatepassDate || oData.RequestDate || oData.Requestdate || oData.CreateDate || oData.CreatedOn || oData.Erdat || oData.Aedat);
			if (!sGpDate) {
				sGpDate = this._formatDate(new Date());
			}
			var sFY     = oData.FiscalYear   || oData.Gjahr     || oData.FisYear  || String(new Date().getFullYear());
			var sVGST   = oData.VendorGST    || oData.VendorGst || oData.TaxNo    || "";
			var sCity   = oData.City         || oData.City1     || "";
			var sZip    = oData.ZipCode      || oData.Pstlz     || "";
			var sVehNo  = oData.VehicleNo    || oData.Vehicle   || oData.Vehicleno || "";
			var sMod    = oData.ModeOfDispatch || oData.ModeDispatch || oData.TransportMode || "";
			var sRmk    = oData.Remarks      || oData.Remark    || "";
			var sReqNo  = oData.GatePassReqNo || oData.GatePassreqNo || "";

			oModel.setProperty("/GatePassReqNo",  sReqNo);
			oModel.setProperty("/GatePassType",   oData.GatePassType  || "");
			oModel.setProperty("/Status",         sStatus);
			oModel.setProperty("/GpDate",         sGpDate);
			oModel.setProperty("/Plant",          oData.Plant         || "");
			oModel.setProperty("/FiscalYear",     sFY);
			oModel.setProperty("/Department",     oData.Department    || "");
			oModel.setProperty("/VendorName",     oData.VendorName    || oData.Vendor1 || oData.Name1 || "");
			oModel.setProperty("/VendorGST",      sVGST);
			oModel.setProperty("/VendorAddress",  [sCity, sZip].filter(Boolean).join(", "));
			oModel.setProperty("/DueDate",        this._formatDate(oData.ReturnableDate || oData.DueDate || ""));
			oModel.setProperty("/VehicleNo",      sVehNo);
			oModel.setProperty("/ModeOfDispatch", sMod);
			oModel.setProperty("/Remarks",        sRmk);
			oModel.setProperty("/HODRemarks",     oData.HODRemarks    || oData.HodRemarks   || "");
			oModel.setProperty("/STORERemarks",   oData.STORERemarks  || oData.StoreRemarks || "");
			var sRawImg1 = oData.Base64Img1 || oData.Base64img1 || "";
			var sRawImg2 = oData.Base64Img2 || oData.Base64img2 || "";
			var sFname1  = oData.FILENAME   || oData.Filename    || oData.FileName   || oData.Fname || "";
			var sFtype1  = (oData.FILETYPE  || oData.Filetype    || oData.FileType   || oData.Ftype || "").toUpperCase().trim();
			var sFname2  = oData.FILENAME2  || oData.Filename2   || oData.FileName2  || oData.Fname2 || "";
			var sFtype2  = (oData.FILETYPE2 || oData.Filetype2   || oData.FileType2  || oData.Ftype2 || "").toUpperCase().trim();

			if (!sRawImg1 || !sRawImg2) {
				var aLocal = this._getLocalStorageAttachment(sReqNo);
				if (aLocal && aLocal.length > 0) {
					if (!sRawImg1) {
						sRawImg1 = aLocal[0].content;
						if (!sFname1) sFname1 = aLocal[0].name;
						if (!sFtype1) sFtype1 = aLocal[0].type;
					}
					if (!sRawImg2 && aLocal.length > 1) {
						sRawImg2 = aLocal[1].content;
						if (!sFname2) sFname2 = aLocal[1].name;
						if (!sFtype2) sFtype2 = aLocal[1].type;
					}
				}
			}

			this._processLoadedAttachments({
				Base64Img1: sRawImg1,
				Fname: sFname1,
				Ftype: sFtype1,
				Base64Img2: sRawImg2,
				Fname2: sFname2,
				Ftype2: sFtype2
			}, oModel);			var aRaw = (oData.GateReqItmNav  && oData.GateReqItmNav.results) ||
			           (oData.GateReqItemNav  && oData.GateReqItemNav.results) || [];
			var aItems = aRaw.map(function (it, i) {
				var fQty    = parseFloat(it.RequestedQuantity || it.Quantity   || 0);
				var fRate   = parseFloat(it.ItemNetPrice      || 0);
				var fAmount = parseFloat(it.Totalvalue        || (fQty * fRate).toFixed(2));
				return {
					sno:          i + 1,
					materialName: it.MaterialDesc || it.HSNDesc || it.Description || "",
					hsnCode:      it.HSNCode      || "",
					uom:          it.UOM          || "",
					quantity:     fQty,
					rate:         fRate,
					amount:       fAmount
				};
			});
			oModel.setProperty("/items", aItems);

			var fTotal = aItems.reduce(function (s, it) { return s + parseFloat(it.amount || 0); }, 0);
			oModel.setProperty("/totalAmount", fTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
		},

		_getLocalStorageAttachment: function (sReqNo) {
			if (!sReqNo) return null;
			try {
				var sLocalAttach = localStorage.getItem("attachments_" + sReqNo);
				if (sLocalAttach) {
					var aLocal = JSON.parse(sLocalAttach);
					if (aLocal && aLocal.length > 0) {
						return aLocal.map(function (att) {
							var sFullName = att.name || "";
							var iDot = sFullName.lastIndexOf(".");
							var sFname = iDot !== -1 ? sFullName.substring(0, iDot) : sFullName;
							var sFtype = iDot !== -1 ? sFullName.substring(iDot + 1).toUpperCase().trim() : "";
							return {
								content: att.content || "",
								name: sFname,
								type: sFtype
							};
						});
					}
				}
			} catch (e) {
				console.error("Error reading localStorage attachments for " + sReqNo, e);
			}
			return null;
		},

		_formatDate: function (vDate) {
			if (!vDate || vDate === "00000000" || vDate === "") { return ""; }
			if (typeof vDate === "string" && vDate.indexOf("/Date(") === 0) {
				var ms = parseInt(vDate.replace(/\/Date\((\d+)[^)]*\)\//, "$1"), 10);
				vDate = new Date(ms);
			}
			if (typeof vDate === "string" && /^\d{8}$/.test(vDate)) {
				return vDate.slice(6, 8) + "-" + vDate.slice(4, 6) + "-" + vDate.slice(0, 4);
			}
			if (vDate instanceof Date && !isNaN(vDate)) {
				return vDate.toLocaleDateString("en-GB").split("/").join("-");
			}
			return String(vDate || "");
		},

		_formatBase64ToBlobUrl: function (sRawImg) {
			var sImg = sRawImg || "";
			if (!sImg) return "";
			sImg = sImg.replace(/[\n\r\s]/g, "");
			if (sImg.length < 50) return "";

			var sPossibleHex = sImg.replace(/^0x/i, "");
			var isHex = /^[0-9A-Fa-f]+$/.test(sPossibleHex);

			if (isHex && sPossibleHex.length >= 50) {
				try {
					var upper = sPossibleHex.toUpperCase();
					var startIndex = 0;
					var mimeType  = "image/jpeg";
					
					var pdfIdx  = upper.indexOf("25504446");
					var docxIdx = upper.indexOf("504B0304");
					var jpegIdx = upper.indexOf("FFD8FF");
					var pngIdx  = upper.indexOf("89504E47");
					var gifIdx  = upper.indexOf("47494638");

					var indices = [
						{ mime: "application/pdf", idx: pdfIdx },
						{ mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", idx: docxIdx },
						{ mime: "image/jpeg", idx: jpegIdx   },
						{ mime: "image/png",  idx: pngIdx },
						{ mime: "image/gif",  idx: gifIdx }
					].filter(function (x) { return x.idx !== -1; });

					if (indices.length > 0) {
						indices.sort(function (a, b) { return a.idx - b.idx; });
						startIndex = indices[0].idx;
						mimeType   = indices[0].mime;
					}

					var actualHex = sPossibleHex.substring(startIndex);
					if (actualHex.length % 2 !== 0) { actualHex = actualHex.substring(0, actualHex.length - 1); }

					var numBytes  = actualHex.length / 2;
					var byteArray = new Uint8Array(numBytes);
					for (var i = 0; i < numBytes; i++) {
						byteArray[i] = parseInt(actualHex.substr(i * 2, 2), 16);
					}
					var b64 = "";
					var BCHUNK = 3072;
					for (var j = 0; j < byteArray.length; j += BCHUNK) {
						var slice = byteArray.subarray(j, j + BCHUNK);
						var bStr  = "";
						for (var k = 0; k < slice.length; k++) { bStr += String.fromCharCode(slice[k]); }
						b64 += btoa(bStr);
					}
					return "data:" + mimeType + ";base64," + b64;
				} catch (e) { /* fall through */ }
			}

			var sB64 = sImg.replace(/ /g, "+");
			if (sB64.indexOf("data:") === 0) return sB64;
			
			var iPdf = sB64.indexOf("JVBERi");
			var iDocx = sB64.indexOf("UEsDB");
			var iJpeg = sB64.indexOf("/9j/");
			var iPng  = sB64.indexOf("iVBORw");

			if (iPdf !== -1) { return "data:application/pdf;base64," + sB64.substring(iPdf); }
			if (iDocx !== -1) { return "data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64," + sB64.substring(iDocx); }
			if (iJpeg !== -1) { return "data:image/jpeg;base64," + sB64.substring(iJpeg); }
			if (iPng  !== -1) { return "data:image/png;base64,"  + sB64.substring(iPng);  }
			
			return "data:image/jpeg;base64," + sB64;
		},

		_detectFileType: function (sRawImg) {
			if (!sRawImg) return "";
			var sClean = sRawImg.trim().replace(/[\n\r\s]/g, "");
			var iComma = sClean.indexOf("base64,");
			var sDetectStr = iComma !== -1 ? sClean.substring(iComma + 7) : sClean;
			var sPossibleHex = sDetectStr.replace(/^0x/i, "");
			
			if (sDetectStr.indexOf("JVBERi") !== -1 || sPossibleHex.indexOf("25504446") !== -1) {
				return "PDF";
			} else if (sDetectStr.indexOf("iVBORw") !== -1 || sPossibleHex.indexOf("89504E47") !== -1) {
				return "PNG";
			} else if (sDetectStr.indexOf("/9j/") !== -1 || sPossibleHex.indexOf("FFD8FF") !== -1) {
				return "JPG";
			} else if (sDetectStr.indexOf("UEsDB") !== -1 || sPossibleHex.indexOf("504B0304") !== -1) {
				return "DOCX";
			}
			return "";
		},

		onApprove: function () {
			var sRemarks = this.getView().getModel("store").getProperty("/STORERemarks") || "";
			sap.m.MessageBox.confirm("Approve this Gate Pass Request?", {
				title: "Confirm Approval",
				onClose: function (sAction) {
					if (sAction === sap.m.MessageBox.Action.OK) { this._updateStatus("A2", "Approved", sRemarks); }
				}.bind(this)
			});
		},

		onReject: function () {
			var sRemarks = this.getView().getModel("store").getProperty("/STORERemarks") || "";
			sap.m.MessageBox.confirm("Reject this Gate Pass Request?", {
				title: "Confirm Rejection",
				onClose: function (sAction) {
					if (sAction === sap.m.MessageBox.Action.OK) { this._updateStatus("R", "Rejected", sRemarks); }
				}.bind(this)
			});
		},

		onAmend: function () {
			var sRemarks = this.getView().getModel("store").getProperty("/STORERemarks") || "";
			sap.m.MessageBox.confirm("Send this request back for Amendment?", {
				title: "Confirm Amendment",
				onClose: function (sAction) {
					if (sAction === sap.m.MessageBox.Action.OK) { this._updateStatus("AM", "Amendment", sRemarks); }
				}.bind(this)
			});
		},

		_updateStatus: function (sApprovalCode, sDisplayStatus, sRemarks) {
			var oODataModel = this.getOwnerComponent().getModel();
			var that = this;

			if (!oODataModel) {
				sap.m.MessageBox.error("SAP system is not connected.");
				return;
			}

			sap.ui.core.BusyIndicator.show(0);

			var oRaw = this._oRawData || {};
			var aRawItems = (oRaw.GateReqItmNav  && oRaw.GateReqItmNav.results) ||
			                (oRaw.GateReqItemNav  && oRaw.GateReqItemNav.results) || [];

			var sFnameClean1 = this.getView().getModel("store").getProperty("/Fname") || "";
			var sFnameClean2 = this.getView().getModel("store").getProperty("/Fname2") || "";

			// Strip extension if present before POSTing to the backend
			var iDot1 = sFnameClean1.lastIndexOf(".");
			if (iDot1 !== -1) {
				sFnameClean1 = sFnameClean1.substring(0, iDot1);
			}
			var iDot2 = sFnameClean2.lastIndexOf(".");
			if (iDot2 !== -1) {
				sFnameClean2 = sFnameClean2.substring(0, iDot2);
			}

			var oPayload = {
				GatePassType:   oRaw.GatePassType   || this._sType,
				Cocode:         oRaw.CoCode         || oRaw.Cocode        || "",
				Plant:          oRaw.Plant          || "",
				FiscalYear:     oRaw.FiscalYear     || "",
				GpDate:         oRaw.GpDate         || oRaw.CreatedOn     || "",
				Vendor:         oRaw.Vendor         || "",
				VendorName:     oRaw.VendorName     || "",
				VendorGST:      oRaw.VendorGST      || oRaw.VendorGst     || "",
				ZipCode:        oRaw.ZipCode        || "",
				City:           oRaw.City           || "",
				ApprovalReq:    sApprovalCode === "AM" ? "" : (oRaw.ApprovalReq || ""),
				Approval1:      sApprovalCode === "AM" ? (oRaw.Approval1 || "") : "",
				Approval2:      sApprovalCode,
				StoreAmmend:    sApprovalCode === "AM" ? "AM" : "",
				Department:     oRaw.Department     || "",
				VehicleNo:      oRaw.VehicleNo      || "",
				ModeOfDispatch: oRaw.ModeOfDispatch || "",
				Remarks:        oRaw.Remarks        || "",
				ReturnableDate: oRaw.ReturnableDate || "",
				Base64Img1:     this._getRawBase64FromModel(this.getView().getModel("store").getProperty("/Base64Img1")),
				Base64Img2:     this._getRawBase64FromModel(this.getView().getModel("store").getProperty("/Base64Img2")),
				Fname:          sFnameClean1,
				Ftype:          this.getView().getModel("store").getProperty("/Ftype") || "",
				Fname2:         sFnameClean2,
				Ftype2:         this.getView().getModel("store").getProperty("/Ftype2") || "",
				HODRemarks:     this.getView().getModel("store").getProperty("/HODRemarks") || "",
				STORERemarks:   sRemarks            || "",
				GatePassReqNo:  this._sReqNo,
				GateReqItemNav: aRawItems.map(function (it) {
					return {
						GatePassType:      it.GatePassType      || "",
						ItemNo:            it.ItemNo            || "",
						Material:          it.Material         || "",
						MaterialDesc:      it.MaterialDesc      || "",
						HSNCode:           it.HSNCode           || "",
						HSNDesc:           it.HSNDesc           || "",
						UOM:               it.UOM               || "",
						ItemNetPrice:      it.ItemNetPrice      || "0.00",
						RequestedQuantity: it.RequestedQuantity || "0.000",
						Totalvalue:        it.Totalvalue        || "0.00",
						Remarks:           it.Remarks           || ""
					};
				})
			};

			oODataModel.create(
				"/GatePassReqHdrSet",
				oPayload,
				{
					success: function (oData) {
						that.getView().getModel("store").setProperty("/Status", sDisplayStatus);
						sap.ui.core.BusyIndicator.hide();
						var sMsg = (oData && oData.Message) || ("Request " + sDisplayStatus + " successfully.");
						sap.m.MessageBox.success(sMsg, {
							onClose: function () {
								// Force fresh fetch from backend on next list load
								var oOData = that.getOwnerComponent().getModel();
								if (oOData) { oOData.refresh(true); }
								that.getRouter().navTo("GatePassList");
							}
						});
					},
					error: function (oErr) {
						sap.ui.core.BusyIndicator.hide();
						var sMsg = "Failed to update request status.";
						try {
							var oBody = JSON.parse(oErr.responseText);
							var aInner = oBody.error && oBody.error.innererror && oBody.error.innererror.errordetails;
							if (aInner && aInner[0]) { sMsg = aInner[0].message; }
							else if (oBody.error && oBody.error.message && oBody.error.message.value) {
								sMsg = oBody.error.message.value;
							}
						} catch (e) { /* use default */ }
						sap.m.MessageBox.error(sMsg);
					}
				}
			);
		},

		onImagePress: function (oEvent) {
			var sSrc = oEvent.getSource().getSrc();
			if (!sSrc) return;
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

		_downloadAttachmentFile: function (index) {
			var oModel = this.getView().getModel("store");
			var suffix = index === 2 ? "2" : "";
			var sBase64 = oModel.getProperty("/Base64Img" + index);
			var sFname = oModel.getProperty("/Fname" + suffix) || ("Attachment_" + index);
			var sFtype = (oModel.getProperty("/Ftype" + suffix) || "JPG").toUpperCase();

			if (!sBase64) return;

			var sMime = "image/jpeg";
			if (sFtype === "PDF") sMime = "application/pdf";
			else if (sFtype === "DOCX") sMime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
			else if (sFtype === "DOC") sMime = "application/msword";
			else if (sFtype === "PNG") sMime = "image/png";

			var sPureBase64 = sBase64;
			if (sBase64.indexOf("base64,") !== -1) {
				sPureBase64 = sBase64.split("base64,")[1];
			}

			try {
				var byteCharacters = atob(sPureBase64);
				var byteNumbers = new Array(byteCharacters.length);
				for (var i = 0; i < byteCharacters.length; i++) {
					byteNumbers[i] = byteCharacters.charCodeAt(i);
				}
				var byteArray = new Uint8Array(byteNumbers);
				var blob = new Blob([byteArray], { type: sMime });
				
				var sFileNameWithExt = sFname;
				if (sFileNameWithExt.indexOf(".") === -1) {
					sFileNameWithExt += "." + sFtype.toLowerCase();
				}

				if (window.navigator && window.navigator.msSaveOrOpenBlob) {
					window.navigator.msSaveOrOpenBlob(blob, sFileNameWithExt);
				} else {
					var link = document.createElement('a');
					link.href = window.URL.createObjectURL(blob);
					link.download = sFileNameWithExt;
					if (sFtype === "PDF") {
						window.open(link.href, "_blank");
					} else {
						document.body.appendChild(link);
						link.click();
						document.body.removeChild(link);
					}
				}
			} catch (e) {
				sap.m.MessageBox.error("Failed to open or download attachment: " + e.message);
			}
		},

		_getRawBase64FromModel: function (sDataUrl) {
			if (!sDataUrl) return "";
			var iComma = sDataUrl.indexOf("base64,");
			if (iComma !== -1) {
				return sDataUrl.substring(iComma + 7);
			}
			return sDataUrl;
		},

		onNavBack: function () {
			this.getRouter().navTo("GatePassList");
		}

	});
});
