sap.ui.define(["zgpms/meilpower/com/controller/BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/m/MessageBox",
	"sap/m/MessageToast",
	"sap/ui/core/Fragment"
], function (BaseController, JSONModel, MessageBox, MessageToast, Fragment) {
	"use strict";

	return BaseController.extend("zgpms.meilpower.com.controller.OutGatePass", {

		onInit: function () {
			this._resetModel();
			this.getRouter().getRoute("OutGatePass").attachPatternMatched(this._onRouteMatched, this);
		},

		_onRouteMatched: function (oEvent) {
			this._resetModel();
			var oArgs = oEvent.getParameter("arguments");
			var sReqNo = oArgs.reqNo;
			var sGPNo  = (oArgs.gpNo && oArgs.gpNo !== "-") ? oArgs.gpNo : "";
			var oUserModel = sap.ui.getCore().getModel("user");
			var bGatepassUserOnly = oUserModel ? oUserModel.getProperty("/IsGatepassUserOnly") : false;
			var bIsHodUser = oUserModel ? oUserModel.getProperty("/IsHodUser") : false;
			var bIsStoreUser = oUserModel ? oUserModel.getProperty("/IsStoreUser") : false;

			if (bIsHodUser && !bIsStoreUser) {
				MessageBox.error("HOD users are not authorized to access the Out Gate Pass Generation screen.");
				this.getRouter().navTo("GatePassList");
				return;
			}

			if (bGatepassUserOnly && !sReqNo) {
				MessageBox.error("You do not have authorization to access the Out Gate Pass screen.");
				this.getRouter().navTo("home");
				return;
			}
			if (sReqNo) {
				this._loadByReqNo(sReqNo, sGPNo);
			}
		},

		_loadByReqNo: function (sReqNo, sGPNo) {
			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) {
				return;
			}

			this.byId("requestSearch").setValue(sReqNo);
			sap.ui.core.BusyIndicator.show(0);

			var that = this;
			var fnProcessResult = function (oResult) {
				sap.ui.core.BusyIndicator.hide();
				var sStatus = that._getNormalizedStatus(oResult);
				var oUserModel = sap.ui.getCore().getModel("user");
				console.log("[GPMS Debug] _loadByReqNo fnProcessResult:", {
					GatePassReqNo: oResult.GatePassReqNo || oResult.GatePassreqNo,
					DerivedStatus: sStatus,
					IsStoreUser: oUserModel ? oUserModel.getProperty("/IsStoreUser") : false,
					GatePassNo: oResult.GatePassNo || "",
					showLogistics: oResult.showLogistics || false
				});
				if (sStatus === "APPROVED" || sStatus === "CLOSED" || sStatus === "CANCELLED" || sStatus === "STORE APPROVAL PENDING") {
					that._validateAndMapData(oResult);
					if (sStatus === "CLOSED") {
						var oOutModel = that.getView().getModel("out");
						oOutModel.setProperty("/ApprovalStatus", "CLOSED");
						oOutModel.setProperty("/ApprovalState", "Success");
						oOutModel.setProperty("/ApprovalIcon", "sap-icon://sys-enter-2");
					} else if (sStatus === "CANCELLED") {
						var oOutModel = that.getView().getModel("out");
						oOutModel.setProperty("/ApprovalStatus", "CANCELLED");
						oOutModel.setProperty("/ApprovalState", "Error");
						oOutModel.setProperty("/ApprovalIcon", "sap-icon://sys-cancel-2");
					}
					// If a GP No was passed directly (navigated from Gate Pass List),
					// force-set it and open logistics immediately
					if (sGPNo) {
						var oOutModel = that.getView().getModel("out");
						oOutModel.setProperty("/GatePassNo", sGPNo);
						oOutModel.setProperty("/showLogistics", true);
					}
				} else if (sStatus === "AMENDMENT") {
					that._validateAndMapData(oResult);
				} else if (sStatus === "REJECTED") {
					sap.m.MessageBox.error("Request Number " + sReqNo + " has been Rejected.");
					that._validateAndMapData(oResult);
					var oOutModel = that.getView().getModel("out");
					oOutModel.setProperty("/ApprovalStatus", "REJECTED");
					oOutModel.setProperty("/ApprovalState", "Error");
					oOutModel.setProperty("/ApprovalIcon", "sap-icon://decline");
				} else {
					that._showApprovalFlow(oResult);
				}
			};

			var fnError = function () {
				sap.ui.core.BusyIndicator.hide();
				sap.m.MessageBox.error("No data found for Request No: " + sReqNo);
			};

			var fnMatchResult = function (aResults) {
				if (!aResults || aResults.length === 0) { return null; }
				var sClean = (sReqNo || "").trim();
				return aResults.find(function (r) {
					var rNo = (r.GatePassReqNo || r.GatePassreqNo || "").trim();
					return rNo === sClean || (parseInt(rNo, 10) === parseInt(sClean, 10) && !isNaN(parseInt(sClean, 10)));
				}) || null;
			};

			// Try 1: Query with Status = 'All' filter (most likely to work for approved requests)
			oODataModel.read("/GateReqHdrSet", {
				filters: [
					new sap.ui.model.Filter("GatePassReqNo", sap.ui.model.FilterOperator.EQ, sReqNo),
					new sap.ui.model.Filter("Status", sap.ui.model.FilterOperator.EQ, "All")
				],
				urlParameters: { "$expand": "GateReqItmNav" },
				success: function (oData) {
					var oResult = fnMatchResult(oData.results);
					if (oResult) {
						fnProcessResult(oResult);
					} else {
						// Try 2: Query without Status filter (fallback)
						oODataModel.read("/GateReqHdrSet", {
							filters: [new sap.ui.model.Filter("GatePassReqNo", sap.ui.model.FilterOperator.EQ, sReqNo)],
							urlParameters: { "$expand": "GateReqItmNav" },
							success: function (oData2) {
								var oResult2 = fnMatchResult(oData2.results);
								if (oResult2) {
									fnProcessResult(oResult2);
								} else {
									// Try 3: Loop through types NRGP/RGP with Status = 'All' (like other detail views)
									that._loadByReqNoFallbackTypes(sReqNo, sGPNo, ["NRGP", "RGP"], fnProcessResult, fnError);
								}
							},
							error: function () {
								that._loadByReqNoFallbackTypes(sReqNo, sGPNo, ["NRGP", "RGP"], fnProcessResult, fnError);
							}
						});
					}
				},
				error: function () {
					// Try without Status filter
					oODataModel.read("/GateReqHdrSet", {
						filters: [new sap.ui.model.Filter("GatePassReqNo", sap.ui.model.FilterOperator.EQ, sReqNo)],
						urlParameters: { "$expand": "GateReqItmNav" },
						success: function (oData2) {
							var oResult2 = fnMatchResult(oData2.results);
							if (oResult2) {
								fnProcessResult(oResult2);
							} else {
								that._loadByReqNoFallbackTypes(sReqNo, sGPNo, ["NRGP", "RGP"], fnProcessResult, fnError);
							}
						},
						error: function () {
							that._loadByReqNoFallbackTypes(sReqNo, sGPNo, ["NRGP", "RGP"], fnProcessResult, fnError);
						}
					});
				}
			});
		},

		_loadByReqNoFallbackTypes: function (sReqNo, sGPNo, aTypes, fnSuccess, fnError) {
			if (aTypes.length === 0) {
				fnError();
				return;
			}
			var sType = aTypes[0];
			var oODataModel = this.getOwnerComponent().getModel();
			var that = this;
			var fnMatchResult = function (aResults) {
				if (!aResults || aResults.length === 0) { return null; }
				var sClean = (sReqNo || "").trim();
				return aResults.find(function (r) {
					var rNo = (r.GatePassReqNo || r.GatePassreqNo || "").trim();
					return rNo === sClean || (parseInt(rNo, 10) === parseInt(sClean, 10) && !isNaN(parseInt(sClean, 10)));
				}) || null;
			};

			oODataModel.read("/GateReqHdrSet", {
				filters: [
					new sap.ui.model.Filter("GatePassReqNo", sap.ui.model.FilterOperator.EQ, sReqNo),
					new sap.ui.model.Filter("GatePassType", sap.ui.model.FilterOperator.EQ, sType),
					new sap.ui.model.Filter("Status", sap.ui.model.FilterOperator.EQ, "All")
				],
				urlParameters: { "$expand": "GateReqItmNav" },
				success: function (oData) {
					var oResult = fnMatchResult(oData.results);
					if (oResult) {
						fnSuccess(oResult);
					} else {
						that._loadByReqNoFallbackTypes(sReqNo, sGPNo, aTypes.slice(1), fnSuccess, fnError);
					}
				},
				error: function () {
					that._loadByReqNoFallbackTypes(sReqNo, sGPNo, aTypes.slice(1), fnSuccess, fnError);
				}
			});
		},

		onAddComment: function () {
			var oOutModel = this.getView().getModel("out");
			var aComments = oOutModel.getProperty("/CommentsList") || [];
			var sDate = new Date().toLocaleDateString("en-GB", {
				day: "2-digit",
				month: "2-digit",
				year: "numeric"
			}).split("/").join("-");

			aComments.push({
				text: "",
				date: sDate
			});
			oOutModel.setProperty("/CommentsList", aComments);
			oOutModel.refresh(true);
		},

		onDeleteComment: function (oEvent) {
			var oItem = oEvent.getSource().getParent();
			var oTable = oItem.getParent();
			var iIndex = oTable.indexOfItem(oItem);

			var oOutModel = this.getView().getModel("out");
			var aComments = oOutModel.getProperty("/CommentsList");
			aComments.splice(iIndex, 1);
			oOutModel.setProperty("/CommentsList", aComments);
			oOutModel.refresh(true);
		},
		onQuantityChange: function (oEvent) {
			var oItem = oEvent.getSource().getBindingContext("out").getObject();
			var oOutModel = this.getView().getModel("out");

			var fSent = parseFloat(oItem.sentQty || 0);
			var fRecvd = parseFloat(oItem.recvdQty || 0);
			var fRate = parseFloat(oItem.rate || 0);

			// Update Balance with precision rounding
			oItem.balQty = parseFloat((fSent - fRecvd).toFixed(3));

			// Update Amount with precision rounding
			oItem.amount = parseFloat((fSent * fRate).toFixed(3));

			oOutModel.refresh(true);
			this._calculateFinalTotal();
		},

		_calculateFinalTotal: function () {
			var oOutModel = this.getView().getModel("out");
			var aItems = oOutModel.getProperty("/items") || [];
			var fTotal = aItems.reduce(function (sum, item) {
				return sum + parseFloat(item.amount || 0);
			}, 0);
			oOutModel.setProperty("/FinalTotal", fTotal.toLocaleString('en-IN', {
				minimumFractionDigits: 2,
				maximumFractionDigits: 2
			}));
		},

		_resetModel: function () {
			var oData = {
				GatePassreqNo: "",
				GatePassNo: "",
				GatePassType: "",
				GatePassDate: "",
				Requestor: "",
				Department: "",
				VendorName: "",
				VendorGST: "",
				VendorAddress: "",
				UserRemarks: "",
				HODRemarks: "",
				StoreRemarks: "",
				items: [],
				FinalTotal: "0.00",
				showLogistics: false,
				showApprovalFlow: false,
				HODApproved: false,
				StoreApproved: false,
				StoreActive: false,
				DocOptionIndex: 0,
				Status: "OPEN",
				CommentsList: [],
				TransporterName: "",
				TransporterGST: "",
				DCNotes: "",
				InsuranceRequired: false,
				LRNnumber: "",
				VehicleNo: "",
				ModeOfTransport: "Road",
				TransportByIndex: 1,
				NoOfPackages: 0,
				ChallanNumber: "",
				ChallanDate: null,
				CommonDesc: "",
				Plant: "",
				ExtendedReturnableDate: null,
				Cocode: ""
			};
			var oModel = this.getView().getModel("out");
			if (oModel) {
				oModel.setData(oData);
			} else {
				this.getView().setModel(new JSONModel(oData), "out");
			}
		},

		onSearchRequest: function (oEvent) {
			var sReqNo = "";
			if (oEvent.getParameter("selectedItem")) {
				sReqNo = oEvent.getParameter("selectedItem").getKey();
			} else if (oEvent.getParameter("query")) {
				sReqNo = oEvent.getParameter("query");
			} else {
				return;
			}

			if (!sReqNo) {
				MessageBox.error("Request number not found");
				return;
			}

			var oODataModel = this.getOwnerComponent().getModel();
			this._resetModel(); // Clear existing
			if (!oODataModel) {
				MessageBox.error("Backend OData service not connected.");
				return;
			}

			this._loadByReqNo(sReqNo, "");
		},

		onNextSection: function (oEvent) {
			var oOutModel = this.getView().getModel("out");

			// Show the logistics section
			oOutModel.setProperty("/showLogistics", true);

			// Wait for UI to render then scroll
			setTimeout(function () {
				var oVBox = this.getView().byId("outGatePassPage").getContent()[0];
				var aItems = oVBox.getItems();
				// The Logistics panel is the one with visible binding
				var oLogistics = aItems.find(function (item) {
					return item.getMetadata().getName() === "sap.m.Panel" && item.getHeaderText() === "LOGISTICS & DOCUMENTS";
				});

				if (oLogistics && oLogistics.getDomRef()) {
					oLogistics.getDomRef().scrollIntoView({ behavior: "smooth", block: "start" });
				}
			}.bind(this), 100);
		},

		_getNormalizedStatus: function (oData) {
			if (!oData) {
				return "PENDING";
			}
			
			var sDept = (oData.Department || "").trim().toUpperCase();
			var sAppReq = (oData.ApprovalReq || "").trim().toUpperCase();

			var s1 = oData.Approval1;
			if (!s1 || s1 === "null" || s1 === "undefined") s1 = "";
			s1 = String(s1).trim().toUpperCase();

			var s2 = oData.Approval2;
			if (!s2 || s2 === "null" || s2 === "undefined") s2 = "";
			s2 = String(s2).trim().toUpperCase();

			var sStatus = oData.Status;
			if (!sStatus || sStatus === "null" || sStatus === "undefined") sStatus = "";
			sStatus = String(sStatus).trim().toUpperCase();

			if (s1 === "R"  || s2 === "R" || sStatus === "REJECTED")  return "REJECTED";
			if (s1 === "AM" || s2 === "AM" || sStatus === "AMENDMENT" || sStatus === "AM") return "AMENDMENT";
			if (sStatus === "CANCELLED" || sStatus === "CANCEL" || sStatus === "CAN") return "CANCELLED";
			if (sStatus === "CLOSED"    || sStatus === "C") return "CLOSED";

			// If Store generated the request (Department is Store or ApprovalReq is not 'X'), no HOD approval needed!
			var bIsStoreDept = (sDept === "STORE" || sDept === "STORES" || sDept === "STR" || sDept.indexOf("STORE") !== -1 || sAppReq === "" || sAppReq === "N");
			if (bIsStoreDept) {
				return "APPROVED";
			}

			// If Store approved or HOD approved or Status is Approved / Store Approval Pending
			if (s2 || sStatus === "APPROVED") return "APPROVED";
			if (s1 && s1 !== "PENDING") return "APPROVED"; // HOD approved, ready for Store Gate Pass Generation
			if (sStatus === "STORE APPROVAL PENDING") return "APPROVED"; // Ready for Store Gate Pass Generation

			return "PENDING";
		},

		_showApprovalFlow: function (oResult) {
			var oOutModel = this.getView().getModel("out");
			
			var s2 = oResult.Approval2;
			if (!s2 || s2 === "null" || s2 === "undefined") s2 = "";
			var bStoreApproved = !!s2;

			var s1 = oResult.Approval1;
			if (!s1 || s1 === "null" || s1 === "undefined") s1 = "";
			var bHODApproved = !!s1 || bStoreApproved;
			
			oOutModel.setProperty("/showApprovalFlow", true);
			oOutModel.setProperty("/HODApproved", bHODApproved);
			oOutModel.setProperty("/StoreApproved", bStoreApproved);
			oOutModel.setProperty("/StoreActive", bHODApproved || bStoreApproved);
			oOutModel.setProperty("/GatePassreqNo", oResult.GatePassReqNo || "");
			oOutModel.setProperty("/Department", oResult.Department || "");
			var sHODRem = oResult.HODRemarks || oResult.HodRemarks || "";
			var sStoreRem = oResult.STORERemarks || oResult.StoreRemarks || "";
			oOutModel.setProperty("/HODRemarks", sHODRem);
			oOutModel.setProperty("/StoreRemarks", sStoreRem);
			var sReqNoKey = String(oResult.GatePassReqNo || "").trim();
			if (sReqNoKey && (sHODRem || sStoreRem)) {
				try {
					localStorage.setItem("req_remarks_" + sReqNoKey, JSON.stringify({ HODRemarks: sHODRem, StoreRemarks: sStoreRem }));
				} catch (e) {}
			}
		},

		_validateAndMapData: function (oData) {
			var oOutModel = this.getView().getModel("out");
			oOutModel.setProperty("/showApprovalFlow", false);

			var sReqNo = oData.GatePassReqNo || oData.GatePassreqNo || "";
			var aAttachments = [];

			// 1. Extract from payload if available
			if (oData.Base64Img1) {
				aAttachments.push({ name: "Attachment_1.jpg", content: oData.Base64Img1 });
			}
			if (oData.Base64Img2) {
				aAttachments.push({ name: "Attachment_2.jpg", content: oData.Base64Img2 });
			}
			if (oData.Base64Img3) {
				aAttachments.push({ name: "Attachment_3.jpg", content: oData.Base64Img3 });
			}
			if (oData.Base64Img4) {
				aAttachments.push({ name: "Attachment_4.jpg", content: oData.Base64Img4 });
			}

			// 2. Fallback to localStorage for local drafts
			if (aAttachments.length === 0 && sReqNo) {
				var sStored = localStorage.getItem("attachments_" + sReqNo);
				if (sStored) {
					try {
						aAttachments = JSON.parse(sStored);
					} catch(e) {}
				}
			}
			oOutModel.setProperty("/attachments", aAttachments);

			// Auto-detect navigation property
			var aItems = [];
			if (oData.OutgateNav && oData.OutgateNav.results) {
				aItems = oData.OutgateNav.results;
			} else if (oData.GateReqItmNav && oData.GateReqItmNav.results) {
				aItems = oData.GateReqItmNav.results;
			}
			// Mapping from OutGatePassSet sample payload
			oOutModel.setProperty("/GatePassreqNo", oData.GatePassReqNo || oData.GatePassreqNo);
			oOutModel.setProperty("/Base64Img1", oData.Base64Img1 || "");
			
			var sStatus = this._getNormalizedStatus(oData);
			oOutModel.setProperty("/ApprovalStatus", sStatus);
			
			var oUserModel = sap.ui.getCore().getModel("user");
			console.log("[GPMS Debug] _validateAndMapData status and role details:", {
				ApprovalStatus: sStatus,
				IsStoreUser: oUserModel ? oUserModel.getProperty("/IsStoreUser") : false,
				GatePassNo: oData.GatePassNo || "",
				showLogistics: oOutModel.getProperty("/showLogistics") || false
			});

			// Set state and icon based on status
			var sState = "Warning";
			var sIcon = "sap-icon://alert";
			if (sStatus === "APPROVED") {
				sState = "Success";
				sIcon = "sap-icon://sys-enter-2";
			} else if (sStatus === "REJECTED") {
				sState = "Error";
				sIcon = "sap-icon://sys-cancel-2";
			} else if (sStatus === "AMENDMENT") {
				sState = "Information";
				sIcon = "sap-icon://edit";
			}
			oOutModel.setProperty("/ApprovalState", sState);
			oOutModel.setProperty("/ApprovalIcon", sIcon);
			oOutModel.setProperty("/GatePassNo", oData.GatePassNo || "");
			oOutModel.setProperty("/GatePassType", oData.GatePassType || "");
			oOutModel.setProperty("/GatePassDate", new Date().toLocaleDateString("en-GB").split("/").join("-"));
			oOutModel.setProperty("/ReturnableDate", oData.ReturnableDate || null);
			var sReqName = oData.Requestor || oData.ReqUser || oData.Requser || oData.requser || oData.RequestedUser || oData.ReqEmpName || oData.ReqName || oData.RequestorName || oData.CreatedBy || oData.Createdby || oData.Ernam || oData.Uname || oData.Username || "";
			if (!sReqName) {
				try {
					var oUserM = sap.ui.getCore().getModel("user");
					if (oUserM) {
						sReqName = oUserM.getProperty("/id") || oUserM.getProperty("/sUserId") || oUserM.getProperty("/User") || "";
					}
				} catch (e) {}
			}
			if (!sReqName) {
				try {
					var sLocalUser = localStorage.getItem("gpms_user");
					if (sLocalUser) {
						var oParsedUser = JSON.parse(sLocalUser);
						sReqName = oParsedUser.id || oParsedUser.sUserId || oParsedUser.User || "";
					}
				} catch (e) {}
			}
			oOutModel.setProperty("/Requestor", sReqName);
			oOutModel.setProperty("/Department", oData.Department);
			oOutModel.setProperty("/Vendor", oData.Vendor || oData.Lifnr || "");
			oOutModel.setProperty("/VendorName", oData.VendorName);
			oOutModel.setProperty("/VendorGST", oData.VendorGST);
			oOutModel.setProperty("/ZipCode", oData.ZipCode || oData.PostalCode || "");
			oOutModel.setProperty("/City", oData.City || "");
			oOutModel.setProperty("/FiscalYear", oData.FiscalYear || String(new Date().getFullYear()));
			var oLocalLogistics = null;
			try {
				var sCleanGPNo = (oData.GatePassNo || "").trim();
				var sCleanReqNo = (sReqNo || "").trim();
				var sLocal = (sCleanGPNo ? (localStorage.getItem("logistics_" + sCleanGPNo) || localStorage.getItem("gp_logistics_" + sCleanGPNo)) : null) || (sCleanReqNo ? (localStorage.getItem("logistics_" + sCleanReqNo) || localStorage.getItem("gp_logistics_" + sCleanReqNo)) : null);
				console.log("[GPMS Debug] _validateAndMapData: sCleanGPNo =", sCleanGPNo, "sCleanReqNo =", sCleanReqNo, "sLocal =", sLocal);
				if (sLocal) {
					oLocalLogistics = JSON.parse(sLocal);
				}
			} catch (e) {
				console.error("[GPMS Debug] _validateAndMapData error:", e);
			}

			var sTransName = oData.TransporterName || (oLocalLogistics ? oLocalLogistics.TransporterName : "") || "";
			var sTransGST  = oData.TransporterGST  || (oLocalLogistics ? oLocalLogistics.TransporterGST : "")  || "";
			var sEWayNo    = oData.EWayBillNo || (oLocalLogistics ? oLocalLogistics.EWayBillNo : "") || "";
			var sEWayDate  = oData.EWayBillDate || (oLocalLogistics ? oLocalLogistics.EWayBillDate : null);
			var sDCNotes   = oData.DCNotes || (oLocalLogistics ? oLocalLogistics.DCNotes : "") || "";

			oOutModel.setProperty("/TransporterName", sTransName);
			oOutModel.setProperty("/TransporterGST",  sTransGST);
			oOutModel.setProperty("/EWayBillNo",      sEWayNo);
			oOutModel.setProperty("/EWayBillDate",    sEWayDate);
			oOutModel.setProperty("/DCNotes",         sDCNotes);

			var sStreetAddr = oData.Address || oData.VendorAddress || oData.Street || oData.Stras || oData.Address1 || "";
			var sCityVal = oData.City || oData.Ort01 || "";
			var sStateVal = oData.State || oData.Region || oData.District || "";
			var sZipVal = oData.ZipCode || oData.PostalCode || oData.Pstlz || "";
			var sCountryVal = oData.Country || oData.Land1 || "";
			var sCityLineVal = [sCityVal, sZipVal, sCountryVal].filter(Boolean).join(" ");
			var aLineParts = [];
			if (sStreetAddr) { aLineParts.push(sStreetAddr); }
			if (sCityLineVal) { aLineParts.push(sCityLineVal); }
			var sFullVendorAddr = aLineParts.join("\n");
			if (!sFullVendorAddr) {
				var aAddrParts = [sStreetAddr, sCityVal, sStateVal, sZipVal, sCountryVal].map(function (s) { return (s || "").trim(); }).filter(Boolean);
				var aUniqueParts = [];
				aAddrParts.forEach(function (pt) { if (aUniqueParts.indexOf(pt) === -1) { aUniqueParts.push(pt); } });
				sFullVendorAddr = aUniqueParts.join(", ");
			}
			oOutModel.setProperty("/Address", sStreetAddr);
			oOutModel.setProperty("/City", sCityVal);
			oOutModel.setProperty("/ZipCode", sZipVal);
			oOutModel.setProperty("/Country", sCountryVal);
			oOutModel.setProperty("/VendorAddress", sFullVendorAddr);

			if (oData.Vendor || oData.VendorCode) {
				this._enrichVendorAddressMaster(oData.Vendor || oData.VendorCode, oData.Plant || "2301", oOutModel);
			}

			oOutModel.setProperty("/VendorPerson", oData.VendorPerson || (oLocalLogistics ? oLocalLogistics.VendorPerson : "") || "");
			oOutModel.setProperty("/UserRemarks", oData.Remarks || "");
			oOutModel.setProperty("/HODRemarks", oData.HODRemarks || "");
			oOutModel.setProperty("/StoreRemarks", oData.STORERemarks || "");
			oOutModel.setProperty("/LRNnumber", oData.LRNumber || oData.LRNnumber || "");
			oOutModel.setProperty("/VehicleNo", oData.VehicleNo || "");
			oOutModel.setProperty("/ModeOfTransport", oData.ModeOfDispatch || "");
			oOutModel.setProperty("/Plant", oData.Plant || oData.Werks || "");
			oOutModel.setProperty("/Cocode", oData.Bukrs || oData.BUKRS || oData.Cocode || oData.CoCode || oData.CompanyCode || "");
			oOutModel.setProperty("/CommonDesc", oData.CommonDesc || (oLocalLogistics ? oLocalLogistics.CommonDesc : "") || "");
			var sInsReq = String(oData.InsuranceReq || oData.Insurance || oData.InsuranceRequired || "").trim().toUpperCase();
			var bInsRequired = (sInsReq === "YES" || sInsReq === "X" || sInsReq === "Y" || sInsReq === "TRUE" || sInsReq === "1" || oData.InsuranceReq === true || oData.InsuranceRequired === true) ||
			                   (oLocalLogistics ? (oLocalLogistics.bInsured || oLocalLogistics.InsuranceRequired) : false);
			oOutModel.setProperty("/InsuranceReq", bInsRequired ? "YES" : "NO");
			oOutModel.setProperty("/InsuranceRequired", bInsRequired);
			oOutModel.setProperty("/InsuranceDate", oData.InsuranceDate || "");
			oOutModel.setProperty("/InsuranceAmount", oData.InsuranceAmount || 0);

			// Detect items from different potential navigation properties
			var aItems = [];
			if (oData.OutgateNav) {
				aItems = oData.OutgateNav.results || (Array.isArray(oData.OutgateNav) ? oData.OutgateNav : []);
			} else if (oData.GateReqItmNav) {
				aItems = oData.GateReqItmNav.results || (Array.isArray(oData.GateReqItmNav) ? oData.GateReqItmNav : []);
			} else if (oData.GateReqItemNav) {
				aItems = oData.GateReqItemNav.results || (Array.isArray(oData.GateReqItemNav) ? oData.GateReqItemNav : []);
			}

			var aMappedItems = aItems.map(function (it, index) {
				// Handle field name variations across different sets
				var fQty = parseFloat(it.RequestedQuantity || it.Quantity || it.Menge || it.RequestedQty || it.Requestedqty || it.Qty || 0);
				var fRate = parseFloat(it.ItemNetPrice || it.Rate || it.Netpr || it.NetPrice || 0);
				var fTotal = parseFloat(it.Totalvalue || it.TotalValue || it.Netwr || (fQty * fRate));

				return {
					sno: index + 1,
					material: it.Material || it.Matnr || "",
					materialName: it.MaterialDesc || it.MaterialName || it.Description || it.Maktx || it.HSNDesc || it.Material || it.Matnr || "",
					hsnCode: it.HSNCode || it.Hsncode || "",
					hsnDesc: it.HSNDesc || "",
					sentQty: fQty,
					recvdQty: 0,
					balQty: fQty,
					uom: it.UOM || it.Uom || it.Meins || "",
					rate: fRate,
					amount: fTotal
				};
			});
			oOutModel.setProperty("/items", aMappedItems);

			// Recalc Total
			var fTotal = aMappedItems.reduce(function (sum, it) { return sum + it.amount; }, 0);
			oOutModel.setProperty("/FinalTotal", fTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 }));

			// Show logistics section only if gate pass has already been generated
			oOutModel.setProperty("/showLogistics", !!(oData.GatePassNo || "").trim());
			if ((oData.GatePassNo || "").trim()) {
				var sChallan = oData.ChallanNumber || (oLocalLogistics ? oLocalLogistics.ChallanNumber : "") || "";
				oOutModel.setProperty("/ChallanNumber", sChallan);
				oOutModel.setProperty("/InsuranceRequired", !!(oData.InsuranceRequired || (oLocalLogistics && (oLocalLogistics.InsuranceRequired || oLocalLogistics.bInsured))));
				oOutModel.setProperty("/ChallanDate", oData.ChallanDate || null);
				oOutModel.setProperty("/EWayBillNo", oData.EWayBillNo || "");
				oOutModel.setProperty("/EWayBillDate", oData.EWayBillDate || null);
				oOutModel.setProperty("/DCNotes", oData.DCNotes || "");
				oOutModel.setProperty("/DocOptionIndex", sChallan ? 1 : 0);
				var sStatusVal;
				if (oLocalLogistics && oLocalLogistics.GPStatus) {
					sStatusVal = oLocalLogistics.GPStatus.trim().toUpperCase();
				} else if (oData.GPStatus && oData.GPStatus.trim().toUpperCase() !== "OPEN" && oData.GPStatus.trim() !== "") {
					sStatusVal = oData.GPStatus.trim().toUpperCase();
				} else {
					sStatusVal = "OPEN";
				}
				if (sStatusVal === "AWAITING FOR RETURN" || sStatusVal === "AWAITING ACKNOWLEDGEMENT") {
					sStatusVal = "AWAITING FOR VENDOR ACKNOWLEDGEMENT";
				}
				console.log("[GPMS Debug] _validateAndMapData: setting /Status =", sStatusVal);
				oOutModel.setProperty("/Status", sStatusVal);
				// Restore Transport By radio: Self if name matches company, else Vendor
				var sSavedTransporter = oData.TransporterName || "";
				var bIsSelf = (sSavedTransporter === "MEIL Neyveli Energy Private Limited");
				oOutModel.setProperty("/TransportByIndex", bIsSelf ? 0 : 1);
			}
			var bIsStoreUser = oUserModel ? oUserModel.getProperty("/IsStoreUser") : false;
			var sGPStatus = (oOutModel.getProperty("/Status") || "").toUpperCase();
			oOutModel.setProperty("/isEditable", bIsStoreUser && sGPStatus !== "CLOSED" && sGPStatus !== "CANCELLED");
			oOutModel.refresh(true);

			// Always check OutGatePassSet directly to load the latest saved logistics and status details
			var sReqNo = oData.GatePassReqNo || oData.GatePassreqNo || "";
			var sGPType = oData.GatePassType || "";
			if (sReqNo) {
				this._checkExistingGatePass(sReqNo, sGPType);
			}
		},

		_checkExistingGatePass: function (sReqNo, sGPType) {
			var oODataModel = this.getOwnerComponent().getModel();
			var oOutModel = this.getView().getModel("out");
			if (!oODataModel) { return; }

			var aFilters = [new sap.ui.model.Filter("GatePassreqNo", sap.ui.model.FilterOperator.EQ, sReqNo)];
			if (sGPType) {
				aFilters.push(new sap.ui.model.Filter("GatePassType", sap.ui.model.FilterOperator.EQ, sGPType));
			}

			oODataModel.read("/OutGatePassSet", {
				filters: aFilters,
				urlParameters: { "$expand": "OutgateNav" },
				success: function (oData) {
					var aResults = oData.results || [];
					var sCleanReq = (sReqNo || "").trim();
					var oGP = aResults.find(function (r) {
						var sResultReqNo = (r.GatePassreqNo || "").trim();
						var sResultGPNo = (r.GatePassNo || "").trim();
						var bReqMatch = (sResultReqNo === sCleanReq || (parseInt(sResultReqNo, 10) === parseInt(sCleanReq, 10) && !isNaN(parseInt(sCleanReq, 10))));
						var bValidGP = sResultGPNo !== "" && sResultGPNo !== "0000000000" && sResultGPNo !== "-" && sResultGPNo !== sCleanReq;
						return bReqMatch && bValidGP;
					});
					console.log("[GPMS Debug] _checkExistingGatePass response: matched =", JSON.stringify(oGP ? { GatePassNo: oGP.GatePassNo, GatePassreqNo: oGP.GatePassreqNo } : "none"), "total results =", aResults.length);
					if (!oGP || !(oGP.GatePassNo || "").trim()) { return; }
					var sGPNum = (oGP.GatePassNo || "").trim();
					if (!sGPNum || sGPNum === "0000000000" || sGPNum === "-" || sGPNum === sCleanReq) { return; }

					oOutModel.setProperty("/GatePassNo", sGPNum);
					oOutModel.setProperty("/GatePassType", oGP.GatePassType || oOutModel.getProperty("/GatePassType"));
					var vGPDate = oGP.GpDate || oGP.GatePassDate;
					var sGPDateDisplay = "";
					if (vGPDate instanceof Date) {
						sGPDateDisplay = vGPDate.toLocaleDateString("en-GB").split("/").join("-");
					} else if (typeof vGPDate === "string" && /^\d{8}$/.test(vGPDate)) {
						sGPDateDisplay = vGPDate.slice(6, 8) + "-" + vGPDate.slice(4, 6) + "-" + vGPDate.slice(0, 4);
					} else if (vGPDate) {
						var dParsed = new Date(vGPDate);
						sGPDateDisplay = isNaN(dParsed.getTime()) ? "" : dParsed.toLocaleDateString("en-GB").split("/").join("-");
					}
					oOutModel.setProperty("/GatePassDate", sGPDateDisplay || new Date().toLocaleDateString("en-GB").split("/").join("-"));
					oOutModel.setProperty("/showLogistics", true);
					oOutModel.setProperty("/ChallanDate", oGP.ChallanDate || null);
					var oLocalLogistics2 = null;
					try {
						var sCleanGP2 = (oGP.GatePassNo || "").trim();
						var sCleanReq2 = (sReqNo || "").trim();
						var sLocal2 = (sCleanGP2 ? localStorage.getItem("logistics_" + sCleanGP2) : null) || (sCleanReq2 ? localStorage.getItem("logistics_" + sCleanReq2) : null);
						console.log("[GPMS Debug] _checkExistingGatePass: sCleanGP2 =", sCleanGP2, "sCleanReq2 =", sCleanReq2, "sLocal2 =", sLocal2);
						if (sLocal2) {
							oLocalLogistics2 = JSON.parse(sLocal2);
						}
					} catch (e) {
						console.error("[GPMS Debug] _checkExistingGatePass error:", e);
					}

					oOutModel.setProperty("/EWayBillNo", oGP.EWayBillNo || (oLocalLogistics2 ? oLocalLogistics2.EWayBillNo : ""));
					oOutModel.setProperty("/EWayBillDate", oGP.EWayBillDate || (oLocalLogistics2 ? oLocalLogistics2.EWayBillDate : null));
					oOutModel.setProperty("/DCNotes", oGP.DCNotes || (oLocalLogistics2 ? oLocalLogistics2.DCNotes : ""));
					var sCurrentStatus = (oOutModel.getProperty("/Status") || "").trim().toUpperCase();
					var sGPStatusVal;
					if (oLocalLogistics2 && oLocalLogistics2.GPStatus) {
						sGPStatusVal = oLocalLogistics2.GPStatus.trim().toUpperCase();
					} else if (oGP.GPStatus && oGP.GPStatus.trim().toUpperCase() !== "OPEN" && oGP.GPStatus.trim() !== "") {
						sGPStatusVal = oGP.GPStatus.trim().toUpperCase();
					} else {
						// Don't overwrite with "OPEN" from backend — keep what was already set
						sGPStatusVal = sCurrentStatus || "OPEN";
					}
					if (sGPStatusVal === "AWAITING FOR RETURN" || sGPStatusVal === "AWAITING ACKNOWLEDGEMENT") {
						sGPStatusVal = "AWAITING FOR VENDOR ACKNOWLEDGEMENT";
					}
					console.log("[GPMS Debug] _checkExistingGatePass: setting /Status =", sGPStatusVal);
					oOutModel.setProperty("/Status", sGPStatusVal);
					oOutModel.setProperty("/LRNnumber", oGP.LRNumber || oGP.LRNnumber || oOutModel.getProperty("/LRNnumber"));
					oOutModel.setProperty("/VehicleNo", oGP.VehicleNo || oOutModel.getProperty("/VehicleNo"));
					oOutModel.setProperty("/ModeOfTransport", oGP.ModeOfDispatch || oOutModel.getProperty("/ModeOfTransport"));
					oOutModel.setProperty("/TransporterName", oGP.TransporterName || (oLocalLogistics2 ? oLocalLogistics2.TransporterName : "") || oOutModel.getProperty("/TransporterName"));
					oOutModel.setProperty("/TransporterGST", oGP.TransporterGST || (oLocalLogistics2 ? oLocalLogistics2.TransporterGST : "") || oOutModel.getProperty("/TransporterGST"));
					// Restore Transport By radio: Self if name matches company, else Vendor
					var sSavedTransporter2 = oGP.TransporterName || "";
					var bIsSelf2 = (sSavedTransporter2 === "MEIL Neyveli Energy Private Limited");
					oOutModel.setProperty("/TransportByIndex", bIsSelf2 ? 0 : 1);
					// Restore DC option
					var sChallanNum = oGP.ChallanNumber || oGP.Challanumber || oGP.ChallanNo || (oLocalLogistics2 ? oLocalLogistics2.ChallanNumber : "") || "";
					oOutModel.setProperty("/ChallanNumber", sChallanNum);
					oOutModel.setProperty("/DocOptionIndex", sChallanNum ? 1 : 0);
					oOutModel.setProperty("/InsuranceRequired", !!(oGP.InsuranceRequired || (oLocalLogistics2 && (oLocalLogistics2.InsuranceRequired || oLocalLogistics2.bInsured))));
					oOutModel.setProperty("/NoOfPackages", oGP.NoOfPacakages || 0);
					oOutModel.refresh(true);

					// Remap items from gate pass navigation if present
					var aRaw = (oGP.OutgateNav && oGP.OutgateNav.results) || [];
					if (aRaw.length > 0) {
						var aMapped = aRaw.map(function (it, i) {
							var fQty = parseFloat(it.SentQuantity || it.Quantity || 0);
							var fRate = parseFloat(it.ItemNetPrice || it.Rate || 0);
							return {
								sno: i + 1,
								material: it.Material || "",
								materialName: it.MaterialDesc || it.MaterialName || it.Description || it.Maktx || it.HSNDesc || it.Material || "",
								hsnCode: it.HSNCode || "",
								sentQty: fQty,
								recvdQty: 0,
								balQty: fQty,
								uom: it.UOM || "",
								rate: fRate,
								amount: parseFloat((fQty * fRate).toFixed(2))
							};
						});
						oOutModel.setProperty("/items", aMapped);
						var fTotal = aMapped.reduce(function (s, it) { return s + it.amount; }, 0);
						oOutModel.setProperty("/FinalTotal", fTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 }));
					}

					// Extract attachments from gate pass if they weren't in the request
					var aAttachments = oOutModel.getProperty("/attachments") || [];
					if (aAttachments.length === 0) {
						if (oGP.Base64Img1) aAttachments.push({ name: "Attachment_1.jpg", content: oGP.Base64Img1 });
						if (oGP.Base64Img2) aAttachments.push({ name: "Attachment_2.jpg", content: oGP.Base64Img2 });
						if (oGP.Base64Img3) aAttachments.push({ name: "Attachment_3.jpg", content: oGP.Base64Img3 });
						if (oGP.Base64Img4) aAttachments.push({ name: "Attachment_4.jpg", content: oGP.Base64Img4 });
						oOutModel.setProperty("/attachments", aAttachments);
					}

				}.bind(this),
				error: function () { /* silent — if lookup fails, leave form as-is */ }
			});
		},

		onItemUpdate: function (oEvent) {
			var oCtx = oEvent.getSource().getBindingContext("out");
			var oItem = oCtx.getObject();
			var oOutModel = this.getView().getModel("out");

			var fQty = parseFloat(oItem.sentQty || 0);
			var fRate = parseFloat(oItem.rate || 0);
			oItem.amount = parseFloat((fQty * fRate).toFixed(2));
			oItem.balQty = fQty; // Assuming balance is reset on amendment resubmit

			oOutModel.refresh(true);
			this._recalculateFinalTotal();
		},

		_recalculateFinalTotal: function () {
			var oOutModel = this.getView().getModel("out");
			var aItems = oOutModel.getProperty("/items") || [];
			var fTotal = aItems.reduce(function (sum, it) { return sum + parseFloat(it.amount || 0); }, 0);
			oOutModel.setProperty("/FinalTotal", fTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 }));
		},

		onCommonDescEdit: function (oEvent) {
			var oSource = oEvent.getSource();
			var oModel = this.getView().getModel("out");
			var sInitialVal = oModel.getProperty("/CommonDesc") || "";

			var oConfirmButton = new sap.m.Button({
				text: "Confirm",
				type: "Emphasized",
				enabled: sInitialVal.length <= 500,
				press: function () {
					oModel.setProperty("/CommonDesc", oTextArea.getValue().trim());
					oDialog.close();
				}
			});

			var oTextArea = new sap.m.TextArea({
				value: sInitialVal,
				rows: 6,
				maxLength: 500,
				showExceededText: true,
				width: "100%",
				placeholder: "Enter common description...",
				liveChange: function (oEvent) {
					var sVal = oEvent.getParameter("value") || "";
					var iLen = sVal.length;
					if (iLen > 500) {
						oConfirmButton.setEnabled(false);
					} else {
						oConfirmButton.setEnabled(true);
					}
				}
			});

			var oDialog = new sap.m.Dialog({
				title: "Common Description",
				contentWidth: "460px",
				content: [
					new sap.m.VBox({
						class: "sapUiSmallMarginBeginEnd sapUiSmallMarginTopBottom",
						items: [oTextArea]
					})
				],
				beginButton: oConfirmButton,
				endButton: new sap.m.Button({
					text: "Cancel",
					press: function () { oDialog.close(); }
				}),
				afterClose: function () { oDialog.destroy(); }
			});

			this.getView().addDependent(oDialog);
			oDialog.open();
		},

		onNavHome: function () {
			this.getRouter().navTo("home");
		},

		onAttachmentPress: function (oEvent) {
			var oContext = oEvent.getSource().getBindingContext("out");
			var oAttachment = oContext.getObject();
			if (oAttachment && oAttachment.content) {
				var newTab = window.open();
				if (newTab) {
					newTab.document.write('<iframe src="' + oAttachment.content + '" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>');
				} else {
					var link = document.createElement('a');
					link.href = oAttachment.content;
					link.download = oAttachment.name;
					link.click();
				}
			}
		},

		onApproveInMyInbox: function () {
			window.open("https://10.5.18.54:44300/sap/bc/ui2/flp?sap-client=300&sap-language=EN", "_blank");
		},

		onDocOptionChange: function (oEvent) {
			var iIndex = oEvent.getParameter("selectedIndex");
			var oModel = this.getView().getModel("out");
			oModel.setProperty("/DocOptionIndex", iIndex);
		},

		onTransportByChange: function (oEvent) {
			var iIndex = oEvent.getParameter("selectedIndex");
			var oModel = this.getView().getModel("out");
			if (iIndex === 0) {
				oModel.setProperty("/TransporterName", "MEIL Neyveli Energy Private Limited");
				oModel.setProperty("/TransporterGST", "33AACCS2753B1ZV");
			} else {
				oModel.setProperty("/TransporterName", "");
				oModel.setProperty("/TransporterGST", "");
			}
			oModel.setProperty("/TransportByIndex", iIndex);
		},

		onInsuranceRequiredCheckBoxSelect: function (oEvent) {
			var bSelected = oEvent.getParameter("selected");
			var oModel = this.getView().getModel("out");
			var oData = oModel.getData();
			if (bSelected) {
				if (!this._pInsuranceDialog) {
					this._pInsuranceDialog = sap.ui.core.Fragment.load({
						id: this.getView().getId(),
						name: "zgpms.meilpower.com.view.fragments.InwardInsuranceDialog",
						controller: this
					}).then(function (oDialog) {
						this.getView().addDependent(oDialog);
						oDialog.setModel(new sap.ui.model.json.JSONModel({}), "insurance");
						return oDialog;
					}.bind(this));
				}
				this._pInsuranceDialog.then(function (oDialog) {
					var sLRVal = oData.LRNumber || oData.LRNnumber || oData.LRNo || "";
					oDialog.getModel("insurance").setData({
						InvoiceNo: oData.GatePassNo || "",
						InsuranceDate: new Date().toLocaleDateString("en-GB").split("/").join("-"),
						ReceivedDate: new Date().toLocaleDateString("en-GB").split("/").join("-"),
						Vendor: oData.VendorName || oData.Vendor || "",
						VendorAddress: oData.VendorAddress || "",
						ModeOfTransport: oData.ModeOfTransport || "Road",
						LRNumber: sLRVal,
						LRNnumber: sLRVal,
						VehicleNo: oData.VehicleNo || "",
						InvoiceValue: oData.FinalTotal ? oData.FinalTotal.toString().replace(/,/g, "") : "",
						RgpDescription: oData.CommonDesc || oData.UserRemarks || oData.DCNotes || ""
					});
					oDialog.open();
				}).catch(function (oError) {
					sap.ui.core.BusyIndicator.hide();
					sap.m.MessageBox.error("Failed to load Insurance dialog: " + (oError.message || oError));
				});
			} else {
				oModel.setProperty("/InsuranceRequired", false);
				oModel.setProperty("/InsuranceAmount", "");
				try {
					var sKeyLog = oData.GatePassNo || oData.GatePassreqNo || "";
					if (sKeyLog) {
						var oExistingLog = {};
						try { oExistingLog = JSON.parse(localStorage.getItem("logistics_" + sKeyLog) || "{}"); } catch (e) {}
						oExistingLog.bInsured = false;
						oExistingLog.InsuranceRequired = false;
						localStorage.setItem("logistics_" + sKeyLog, JSON.stringify(oExistingLog));
						localStorage.setItem("gp_logistics_" + sKeyLog, JSON.stringify(oExistingLog));
					}
				} catch (eLog) {}
			}
		},

		onInsuranceSubmit: function () {
			var oModel = this.getView().getModel("out");
			this._pInsuranceDialog.then(function (oDialog) {
				var oInsData = oDialog.getModel("insurance").getData();
				var sDate = oInsData.InsuranceDate || "";
				var aParts = sDate.split("-");
				var sFormatted = (aParts.length === 3) ? aParts[2] + aParts[1] + aParts[0] : sDate;
				var sLRSubmit = oInsData.LRNumber || oInsData.LRNnumber || "";
				oModel.setProperty("/InsuranceRequired", true);
				oModel.setProperty("/InsuranceDate", sFormatted);
				oModel.setProperty("/InsuranceAmount", oInsData.InvoiceValue || "");
				if (sLRSubmit) {
					oModel.setProperty("/LRNumber", sLRSubmit);
					oModel.setProperty("/LRNnumber", sLRSubmit);
				}
				var oData = oModel.getData() || {};
				try {
					var sKeyLog = oData.GatePassNo || oData.GatePassreqNo || "";
					if (sKeyLog) {
						var oExistingLog = {};
						try { oExistingLog = JSON.parse(localStorage.getItem("logistics_" + sKeyLog) || "{}"); } catch (e) {}
						oExistingLog.bInsured = true;
						oExistingLog.InsuranceRequired = true;
						oExistingLog.sInsDate = oInsData.InsuranceDate || "";
						oExistingLog.InsuranceDate = oInsData.InsuranceDate || "";
						oExistingLog.sInsAmount = oInsData.InvoiceValue || "";
						oExistingLog.InsuranceAmount = oInsData.InvoiceValue || "";
						if (sLRSubmit) {
							oExistingLog.LRNumber = sLRSubmit;
							oExistingLog.LRNnumber = sLRSubmit;
							oExistingLog.sInsLRVehicleNo = sLRSubmit;
							oExistingLog.OutwardInsLRV = sLRSubmit;
						}
						localStorage.setItem("logistics_" + sKeyLog, JSON.stringify(oExistingLog));
						localStorage.setItem("gp_logistics_" + sKeyLog, JSON.stringify(oExistingLog));
					}
				} catch (eLog) {}
				oDialog.close();
			});
			sap.m.MessageToast.show("Insurance details saved.");
		},

		onInsuranceCancel: function () {
			var oModel = this.getView().getModel("out");
			oModel.setProperty("/InsuranceRequired", false);
			var oCB = this.byId("idInsuranceRequiredCheckBox");
			if (oCB) { oCB.setSelected(false); }
			this._pInsuranceDialog.then(function (oDialog) { oDialog.close(); });
		},

		onGenerateDC: async function (bGetBase64, bSkipOData) {
			try {
			var oOutModel = this.getView().getModel("out");
			oOutModel.setProperty("/DocOptionIndex", 1);
			var oOut = oOutModel.getData();

			if (bSkipOData !== true && bGetBase64 !== true && typeof bGetBase64 !== "boolean") {
				if (!oOut.ChallanNumber) {
					this.onSaveLogistics(true);
					return;
				}
			}
			const jsPDFLib = window.jspdf;
			const jsPDF = (jsPDFLib && jsPDFLib.jsPDF) ? jsPDFLib.jsPDF : (window.jsPDF || window.jspdf);
			var doc = new jsPDF('p', 'mm', 'a4');
			var margin = 15;
			var pageWidth = doc.internal.pageSize.width;
			var pageHeight = doc.internal.pageSize.height;
			var contentWidth = pageWidth - margin * 2;
			var sDate = new Date().toLocaleDateString('en-GB').split('/').join('-');

			// ── PAGE BORDER ──────────────────────────────────────────────────────
			doc.setLineWidth(0.6);
			doc.rect(8, 6, pageWidth - 16, pageHeight - 12);
			doc.setLineWidth(0.2);
			doc.rect(9.5, 7.5, pageWidth - 19, pageHeight - 15);

			// ── HEADER ───────────────────────────────────────────────────────────
			var sLogoUrl = sap.ui.require.toUrl("zgpms/meilpower/com/images/meil_logo.png");
			try {
				var sLogoBase64 = await this._getImageBase64(sLogoUrl);
				doc.addImage(sLogoBase64, 'PNG', margin, 10, 30, 11);
			} catch (e) {
				doc.setFont("helvetica", "bold");
				doc.setFontSize(18);
				doc.setTextColor(180, 0, 0);
				doc.text("M", margin + 5, 18);
				doc.setTextColor(0, 0, 0);
			}

			doc.setTextColor(0, 0, 0);
			doc.setFont("helvetica", "bold");
			doc.setFontSize(13);
			doc.text("MEIL Neyveli Energy Private Limited", pageWidth / 2, 13, { align: "center" });
			doc.setFont("helvetica", "normal");
			doc.setFontSize(7.5);
			doc.text("(Formerly TAQA Neyveli Power Company Private Limited)", pageWidth / 2, 17, { align: "center" });
			doc.text("250MW LFPP, Uthangal, Neyveli, Tamilnadu - 607804, India.", pageWidth / 2, 20.5, { align: "center" });
			doc.text("Tel : +91-4142-270300  |  Fax : +91-4142-270401", pageWidth / 2, 24, { align: "center" });
			doc.setFont("helvetica", "bold");
			doc.text("GSTIN : 33AACCS2753B1ZV  |  CIN : U40109TN1993PTC026223", pageWidth / 2, 27.5, { align: "center" });

			// Thick separator below header
			doc.setLineWidth(0.5);
			doc.line(margin, 30.5, pageWidth - margin, 30.5);

			// ── DOCUMENT TITLE ───────────────────────────────────────────────────
			doc.setFont("helvetica", "bold");
			doc.setFontSize(11);
			doc.text("DELIVERY CHALLAN", pageWidth / 2, 37, { align: "center" });
			var titleW = doc.getTextWidth("DELIVERY CHALLAN");
			doc.setLineWidth(0.35);
			doc.line(pageWidth / 2 - titleW / 2, 38.5, pageWidth / 2 + titleW / 2, 38.5);

			var gridY = 41, gridH = 34;
			var col1W = 62, col2W = 62, col3W = contentWidth - col1W - col2W;
			var col1X = margin, col2X = margin + col1W, col3X = margin + col1W + col2W;
			var pad = 3, lh = 4.5;

			doc.setLineWidth(0.3);
			doc.rect(col1X, gridY, contentWidth, gridH);
			doc.line(col2X, gridY, col2X, gridY + gridH);
			doc.line(col3X, gridY, col3X, gridY + gridH);

			// Col 1 — Consignee / To
			doc.setFontSize(8.5); doc.setFont("helvetica", "bold");
			doc.text("To", col1X + pad, gridY + 6);
			var sPersonName = (oOut.VendorPerson || "").trim();
			if (sPersonName) {
				sPersonName = /^(mr|ms|mrs|mr\/ms)\.?\s+/i.test(sPersonName) ? sPersonName : "Mr/Ms. " + sPersonName;
			}
			doc.setFont("helvetica", "bold"); doc.setFontSize(8);
			doc.text(sPersonName, col1X + pad + 8, gridY + 6);
			doc.text(oOut.VendorName || oOut.Vendor || "", col1X + pad, gridY + 12);
			doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
			var sDcCityLine = [oOut.City, oOut.ZipCode, oOut.Country].filter(Boolean).join(" ");
			var aDcAddrLines = [];
			if (oOut.Address) { aDcAddrLines.push(oOut.Address); }
			if (sDcCityLine) { aDcAddrLines.push(sDcCityLine); }
			var sDcAddrToPrint = (oOut.VendorAddress && oOut.VendorAddress.indexOf("\n") !== -1)
				? oOut.VendorAddress
				: (aDcAddrLines.length > 0 ? aDcAddrLines.join("\n") : (oOut.VendorAddress || ""));
			var splitAddr = doc.splitTextToSize(sDcAddrToPrint, col1W - pad * 2);
			doc.text(splitAddr, col1X + pad, gridY + 17);
			doc.setLineWidth(0.2);
			doc.line(col1X, gridY + gridH - 7, col2X, gridY + gridH - 7);
			doc.setFont("helvetica", "bold"); doc.setFontSize(7.5);
			doc.text("GST No:", col1X + pad, gridY + gridH - 2);
			doc.setFont("helvetica", "normal");
			doc.text(oOut.VendorGST || "", col1X + 16, gridY + gridH - 2);

			// Col 2 — DC & Transport Info
			var c2 = col2X + pad, valOff2 = 28, y2 = gridY + 5;
			doc.setFontSize(7.5);
			doc.setFont("helvetica", "bold"); doc.text("DC No:", c2, y2);
			doc.setFont("helvetica", "normal"); doc.text(oOut.ChallanNumber || "Draft", c2 + valOff2, y2); y2 += lh;
			doc.setFont("helvetica", "bold"); doc.text("DC Date:", c2, y2);
			doc.setFont("helvetica", "normal"); doc.text(sDate, c2 + valOff2, y2); y2 += lh;
			doc.setFont("helvetica", "bold"); doc.text("Mode Of Transport:", c2, y2);
			doc.setFont("helvetica", "normal"); doc.text(oOut.ModeOfTransport || "Road", c2 + valOff2, y2); y2 += lh;
			doc.setFont("helvetica", "bold"); doc.text("LR No:", c2, y2);
			doc.setFont("helvetica", "normal"); doc.text(oOut.LRNumber || oOut.LRNnumber || oOut.VehicleNo || "", c2 + valOff2, y2); y2 += lh;
			doc.setFont("helvetica", "bold"); doc.text("Vehicle No:", c2, y2);
			doc.setFont("helvetica", "normal"); doc.text(oOut.VehicleNo || "", c2 + valOff2, y2); y2 += lh;
			doc.setFont("helvetica", "bold"); doc.text("Transport Name:", c2, y2);
			doc.setFont("helvetica", "normal"); doc.text(oOut.TransporterName || "", c2 + valOff2, y2);

			// Col 3 — GP & Dispatch Info
			var c3 = col3X + pad, valOff3 = 24, y3 = gridY + 5;
			doc.setFontSize(7.5);
			doc.setFont("helvetica", "bold"); doc.text("GP No:", c3, y3);
			doc.setFont("helvetica", "normal"); doc.text(oOut.GatePassNo || "", c3 + valOff3, y3); y3 += lh;
			doc.setFont("helvetica", "bold"); doc.text("GP Date:", c3, y3);
			doc.setFont("helvetica", "normal"); doc.text(oOut.GatePassDate || sDate, c3 + valOff3, y3); y3 += lh;
			doc.setFont("helvetica", "bold"); doc.text("Dept:", c3, y3);
			doc.setFont("helvetica", "normal"); doc.text(oOut.Department || "", c3 + valOff3, y3); y3 += lh;
			doc.setFont("helvetica", "bold"); doc.text("Dispatch From:", c3, y3);
			doc.setFont("helvetica", "normal"); doc.text("MEIL Neyveli", c3 + valOff3, y3); y3 += lh;
			doc.setFont("helvetica", "bold"); doc.text("Dispatch To:", c3, y3);
			doc.setFont("helvetica", "normal"); doc.text(oOut.City || oOut.VendorName || "", c3 + valOff3, y3); y3 += lh;
			doc.setFont("helvetica", "bold"); doc.text("Ewb No:", c3, y3);
			doc.setFont("helvetica", "normal"); doc.text(oOut.EWayBillNo || "", c3 + valOff3, y3);

			// ── ITEMS TABLE ──────────────────────────────────────────────────────
			var tableData = (oOut.items || []).map(function (item, index) {
				return [
					index + 1,
					item.materialName || item.MaterialDesc || item.MaterialName || item.Description || item.HSNDesc || item.material || "",
					item.hsnCode || item.HSNCode || "",
					item.uom || item.UOM || "",
					parseFloat(item.sentQty || item.SentQuantity || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
					parseFloat(item.rate || item.ItemNetPrice || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
					parseFloat(item.amount || item.Totalvalue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
				];
			});
			while (tableData.length < 5) { tableData.push(["", "", "", "", "", "", ""]); }

			doc.autoTable({
				startY: gridY + gridH + 2,
				head: [['S.No', 'DESCRIPTION', 'HSN Code', 'UOM', 'QTY', 'Rate', 'Amt (In Rs.)']],
				body: tableData,
				theme: 'grid',
				headStyles: {
					fillColor: [235, 235, 235],
					textColor: [0, 0, 0],
					fontStyle: 'bold',
					fontSize: 8,
					halign: 'center',
					valign: 'middle',
					cellPadding: 2,
					lineWidth: 0.3,
					lineColor: [0, 0, 0]
				},
				bodyStyles: {
					fontSize: 8,
					cellPadding: { top: 2, bottom: 2, left: 2, right: 2 },
					lineColor: [0, 0, 0],
					lineWidth: 0.25,
					valign: 'middle'
				},
				alternateRowStyles: { fillColor: [250, 250, 250] },
				columnStyles: {
					0: { cellWidth: 12, halign: 'center' },
					1: { cellWidth: 'auto', halign: 'left' },
					2: { cellWidth: 25, halign: 'center' },
					3: { cellWidth: 16, halign: 'center' },
					4: { cellWidth: 20, halign: 'right' },
					5: { cellWidth: 22, halign: 'right' },
					6: { cellWidth: 27, halign: 'right' }
				},
				margin: { left: margin, right: margin }
			});

			var finalY = doc.lastAutoTable.finalY;
			var fTotal = oOut.FinalTotal ? oOut.FinalTotal.toString().replace(/,/g, '') : "0";
			var totalAmt = parseFloat(fTotal) || 0;

			// ── IN WORDS + TOTAL ROW ─────────────────────────────────────────────
			var footH = 9, totalColW = 49;
			doc.setLineWidth(0.25);
			doc.rect(margin, finalY, contentWidth, footH);
			doc.line(pageWidth - margin - totalColW, finalY, pageWidth - margin - totalColW, finalY + footH);
			doc.setFont("helvetica", "normal");
			doc.setFontSize(8);
			doc.text("In Words :  Rupees " + this._numberToWords(Math.round(totalAmt)) + " Only.", margin + 3, finalY + 5.5);
			doc.setFont("helvetica", "bold");
			doc.text("Total", pageWidth - margin - totalColW + 3, finalY + 5.5);
			doc.text(
				totalAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
				pageWidth - margin - 3, finalY + 5.5, { align: "right" }
			);

			// ── NOTE SECTION ─────────────────────────────────────────────────────
			var noteY = finalY + footH + 3;
			var noteText = oOut.DCNotes || "Empty cylinders return to the vendor and there is no sale in this transaction.";
			var splitNote = doc.splitTextToSize(noteText, contentWidth - 22);
			var noteH = Math.max(10, splitNote.length * 5 + 6);
			doc.setLineWidth(0.25);
			doc.rect(margin, noteY, contentWidth, noteH);
			doc.setFont("helvetica", "bold");
			doc.setFontSize(8);
			doc.text("Note :", margin + 3, noteY + 6);
			doc.setFont("helvetica", "normal");
			doc.text(splitNote, margin + 18, noteY + 6);

			// ── DECLARATION ──────────────────────────────────────────────────────
			var declY = noteY + noteH + 6;
			doc.setFont("helvetica", "italic");
			doc.setFontSize(7.5);
			doc.text("We hereby certify that the above mentioned particulars are true and correct.", pageWidth / 2, declY, { align: "center" });

			// ── SIGNATURE SECTION ────────────────────────────────────────────────
			var sigHeaderY = noteY + noteH + 8;
			doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
			doc.text("For MEIL Neyveli Energy Private Limited", pageWidth - margin, sigHeaderY, { align: "right" });

			var sigLineY = sigHeaderY + 18;
			var sigLineW = 55;
			doc.setLineWidth(0.3);
			// Right side: Authorised Signatory
			doc.line(pageWidth - margin - sigLineW, sigLineY, pageWidth - margin, sigLineY);
			doc.setFont("helvetica", "bold"); doc.setFontSize(8);
			doc.text("Authorised Signatory", pageWidth - margin - sigLineW / 2, sigLineY + 5, { align: "center" });

			if (bGetBase64 === true) {
				return doc.output('datauristring').split(',')[1];
			}

			doc.save("DC_" + (oOut.GatePassNo || "Draft") + ".pdf");
			MessageToast.show("Delivery Challan Downloaded");
			} catch (err) {
				console.error("[GPMS] Error in onGenerateDC:", err);
				if (bGetBase64 !== true) {
					MessageBox.error("Failed to generate Delivery Challan PDF: " + (err.message || err));
				}
			}
		},

		onGenerateEWay: async function () {
			var oOut = this.getView().getModel("out").getData();
			const { jsPDF } = window.jspdf;
			var doc = new jsPDF('p', 'mm', 'a4');
			var margin = 10;
			var pageWidth = doc.internal.pageSize.width;
			var sDate = new Date().toLocaleDateString('en-GB').split('/').join('-');

			// --- Page 1 Header ---
			doc.setFont("helvetica", "bold"); doc.setFontSize(14);
			doc.text("e-Way Bill", pageWidth / 2, 15, { align: "center" });

			// QR Code Generation
			var sQRData = "E-Way Bill: " + (oOut.EWayBillNo || "N/A") + "\n" +
				"Gate Pass: " + (oOut.GatePassNo || "N/A") + "\n" +
				"Date: " + sDate + "\n" +
				"Vehicle: " + (oOut.VehicleNo || "N/A");
			try {
				var sQRBase64 = await this._getQRCodeBase64(sQRData);
				doc.addImage(sQRBase64, 'PNG', pageWidth - 42, 8, 30, 30);
			} catch (e) {
				doc.rect(pageWidth - 42, 8, 30, 30);
				doc.setFontSize(7); doc.text("QR ERROR", pageWidth - 27, 23, { align: "center" });
			}

			// --- 1. E-way Bill Details ---
			var y = 42;
			doc.setFontSize(9); doc.text("1- E-way Bill Details", margin, y);
			doc.line(margin, y + 1, pageWidth - margin, y + 1);
			y += 6;
			doc.setFontSize(7.5);
			doc.text("E-way Bill No: " + (oOut.EWayBillNo || ""), margin, y);
			doc.text("Generated Date: " + sDate + " " + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), 75, y);
			doc.text("Generated By: " + (oOut.Cocode || ""), 145, y);
			y += 5;
			doc.text("Mode: " + (oOut.ModeOfTransport || ""), margin, y);
			doc.text("Type: Outward - Others", 75, y);
			doc.text("Transaction Type: Regular", 145, y);
			doc.line(margin, y + 3, pageWidth - margin, y + 3);

			// --- 2. Address Details ---
			y += 10;
			doc.setFont("helvetica", "bold"); doc.text("2- Address Details", margin, y);
			y += 4;
			doc.rect(margin, y, 92, 30); doc.rect(108, y, 92, 30);
			doc.setFontSize(7); doc.text("From", margin + 1, y - 1); doc.text("To", 109, y - 1);
			doc.text("GSTIN : " + (oOut.CocodeGST || "33AACCS2753B1ZV"), margin + 2, y + 5);
			doc.text("MEIL NEYVELI ENERGY PRIVATE LIMITED", margin + 2, y + 10);
			doc.text("GSTIN : " + (oOut.VendorGST || ""), 110, y + 5);
			doc.text(oOut.VendorName || "", 110, y + 10);

			// --- 3. Goods Details ---
			y += 40;
			doc.setFont("helvetica", "bold"); doc.text("3- Goods Details", margin, y);
			var goodsData = (oOut.items || []).map(function (item) {
				return [item.hsnCode, item.materialName, item.sentQty + " " + item.uom, item.amount, "0.00+0.00+0.00+0.00=0.00"];
			});
			doc.autoTable({
				startY: y + 2,
				head: [['HSN Code', 'Product Name & Desc.', 'Quantity', 'Taxable Amt', 'Tax Rate']],
				body: goodsData,
				theme: 'grid',
				headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', lineWidth: 0.1 },
				styles: { fontSize: 7, cellPadding: 1.5, lineColor: [0, 0, 0], lineWidth: 0.1 }
			});

			// --- 4 & 5: Logistics ---
			y = doc.lastAutoTable.finalY + 10;
			doc.text("4- Transportation Details", margin, y);
			doc.line(margin, y + 1, pageWidth - margin, y + 1);
			doc.setFont("helvetica", "normal"); doc.text("Transporter: " + (oOut.TransporterName || "Self"), margin, y + 6);

			y += 15;
			doc.setFont("helvetica", "bold"); doc.text("5- Vehicle Details", margin, y);
			doc.autoTable({
				startY: y + 2,
				head: [['Mode', 'Vehicle No', 'From', 'Date', 'Entered By']],
				body: [['Road', oOut.VehicleNo || "", 'Neyveli', sDate, 'System']],
				theme: 'grid',
				headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', lineWidth: 0.1 },
				styles: { fontSize: 7, cellPadding: 1.5 }
			});

			// --- Page 2: Certification ---
			doc.addPage();
			y = 40;
			doc.setFont("helvetica", "bold"); doc.setFontSize(12);
			doc.text("TO WHOMSOEVER IT MAY CONCERN", pageWidth / 2, y, { align: "center" });
			y += 15;
			doc.setFont("helvetica", "normal"); doc.setFontSize(10);
			var totalAmt = parseFloat(oOut.FinalTotal ? oOut.FinalTotal.toString().replace(/,/g, '') : "0");
			var certText = "This is to certify that we are sending " + (oOut.items[0] ? oOut.items[0].materialName : "Materials") + " vide our " +
				(oOut.GatePassType || "Returnable") + " Gatepass No. " + (oOut.GatePassNo || "Draft") + " Dt. " + sDate + ", DC No. " + (oOut.ChallanNumber || "Draft") + " Dt. " + sDate +
				" from our " + (oOut.Plant || "") + " Power Plant to M/S. " + (oOut.VendorName || "") + ", " + (oOut.VendorAddress || "") + ". Through " + (oOut.VehicleNo || "") + "-" + (oOut.TransporterName || "Self") + ".";
			doc.text(doc.splitTextToSize(certText, pageWidth - 20), margin, y);
			doc.text("Value: Rs. " + totalAmt.toLocaleString() + "/- (" + this._numberToWords(Math.round(totalAmt)) + " Only)", margin, y + 30);

			doc.save("EWayBill_" + (oOut.GatePassNo || "Draft") + ".pdf");
			MessageToast.show("E-Way Bill Generated");
		},

		onPrintGatePass: async function (bGetBase64) {
			try {
			var oOut = this.getView().getModel("out").getData();
			if (!oOut.GatePassNo) {
				MessageBox.warning("Please generate the Gate Pass first.");
				return;
			}

			const jsPDFLib = window.jspdf;
			const jsPDF = (jsPDFLib && jsPDFLib.jsPDF) ? jsPDFLib.jsPDF : (window.jsPDF || window.jspdf);
			// Landscape A4
			var doc = new jsPDF('l', 'mm', 'a4');
			var pageWidth = doc.internal.pageSize.width;    // 297mm
			var pageHeight = doc.internal.pageSize.height;  // 210mm
			var margin = 12;
			var contentWidth = pageWidth - margin * 2;       // 273mm
			var sDate = new Date().toLocaleDateString('en-GB').split('/').join('-');
			var fTotal = parseFloat(oOut.FinalTotal ? oOut.FinalTotal.toString().replace(/,/g, '') : "0") || 0;
			var sType = oOut.GatePassType || "NRGP";
			var sTypeLabel = sType === "RGP" ? "RETURNABLE GATE PASS" : "NON-RETURNABLE GATE PASS";

			var sLogoUrl = sap.ui.require.toUrl("zgpms/meilpower/com/images/meil_logo.png");
			var sLogoBase64 = null;
			try {
				sLogoBase64 = await this._getImageBase64(sLogoUrl);
			} catch (e) { /* logo optional */ }

			var titleW = doc.getTextWidth(sTypeLabel);
			var gridY = 41, gridH = 32;
			var lColW = 105, mColW = 78, rColW = contentWidth - lColW - mColW;
			var lColX = margin, mColX = margin + lColW, rColX = mColX + mColW;
			var pad = 3;
			var sCityLine = [oOut.City, oOut.ZipCode, oOut.Country].filter(Boolean).join(" ");
			var aAddrLines = [];
			if (oOut.Address) { aAddrLines.push(oOut.Address); }
			if (sCityLine) { aAddrLines.push(sCityLine); }
			var sAddrToPrint = (oOut.VendorAddress && oOut.VendorAddress.indexOf("\n") !== -1)
				? oOut.VendorAddress
				: (aAddrLines.length > 0 ? aAddrLines.join("\n") : (oOut.VendorAddress || ""));
			var splitAddr = doc.splitTextToSize(sAddrToPrint, lColW - pad * 2 - 2);

			// ── ITEMS TABLE ──────────────────────────────────────────────────────
			var tableData = (oOut.items || []).map(function (it, i) {
				return [
					i + 1,
					it.materialName || it.MaterialDesc || it.MaterialName || it.Description || it.HSNDesc || it.material || "",
					it.hsnCode || it.HSNCode || "",
					parseFloat(it.sentQty || it.SentQuantity || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
					it.uom || it.UOM || "",
					parseFloat(it.rate || it.ItemNetPrice || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
					parseFloat(it.amount || it.Totalvalue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
				];
			});
			while (tableData.length < 5) { tableData.push(["", "", "", "", "", "", ""]); }

			doc.autoTable({
				startY: 76,
				head: [['S.No', 'DESCRIPTION OF GOODS', 'HSN Code', 'Outward QTY', 'UOM', 'Rate (Rs.)', 'Value (Rs.)']],
				body: tableData,
				theme: 'grid',
				headStyles: {
					fillColor: [235, 235, 235],
					textColor: [0, 0, 0],
					fontStyle: 'bold',
					fontSize: 8.5,
					halign: 'center',
					valign: 'middle',
					cellPadding: 2,
					lineWidth: 0.3,
					lineColor: [0, 0, 0]
				},
				bodyStyles: {
					fontSize: 8.5,
					cellPadding: { top: 2, bottom: 2, left: 2.5, right: 2.5 },
					lineColor: [0, 0, 0],
					lineWidth: 0.25,
					valign: 'middle'
				},
				alternateRowStyles: { fillColor: [250, 250, 250] },
				columnStyles: {
					0: { cellWidth: 14, halign: 'center' },
					1: { cellWidth: 'auto', halign: 'left' },
					2: { cellWidth: 26, halign: 'center' },
					3: { cellWidth: 30, halign: 'right' },
					4: { cellWidth: 18, halign: 'center' },
					5: { cellWidth: 30, halign: 'right' },
					6: { cellWidth: 34, halign: 'right' }
				},
				margin: { top: 76, left: margin, right: margin, bottom: 25 },
				didDrawPage: function (data) {
					// Draw outer borders
					doc.setLineWidth(0.6);
					doc.rect(7, 5, pageWidth - 14, pageHeight - 10);
					doc.setLineWidth(0.2);
					doc.rect(8.5, 6.5, pageWidth - 17, pageHeight - 13);

					// Logo
					if (sLogoBase64) {
						doc.addImage(sLogoBase64, 'PNG', margin, 9, 32, 12);
					} else {
						doc.setFont("helvetica", "bold");
						doc.setFontSize(18);
						doc.setTextColor(180, 0, 0);
						doc.text("MEIL", margin, 18);
						doc.setTextColor(0, 0, 0);
					}

					// Company Info
					doc.setTextColor(0, 0, 0);
					doc.setFont("helvetica", "bold");
					doc.setFontSize(14);
					doc.text("MEIL Neyveli Energy Private Limited", pageWidth / 2, 13, { align: "center" });
					doc.setFont("helvetica", "normal");
					doc.setFontSize(7.5);
					doc.text("(Formerly TAQA Neyveli Power Company Private Limited)", pageWidth / 2, 17, { align: "center" });
					doc.text("250MW LFPP, Uthangal, Neyveli, Tamilnadu - 607804, India.", pageWidth / 2, 20.5, { align: "center" });
					doc.text("Tel : +91-4142-270300  |  Fax : +91-4142-270401", pageWidth / 2, 24, { align: "center" });
					doc.setFont("helvetica", "bold");
					doc.text("GSTIN : 33AACCS2753B1ZV  |  CIN : U40109TN1993PTC026223", pageWidth / 2, 27.5, { align: "center" });

					// GP No & Date
					doc.setFontSize(8.5);
					doc.setFont("helvetica", "bold");
					doc.text("GP No : " + (oOut.GatePassNo || ""), pageWidth - margin, 12, { align: "right" });
					doc.setFont("helvetica", "normal");
					doc.text("Date : " + sDate, pageWidth - margin, 17, { align: "right" });

					// Separator
					doc.setLineWidth(0.5);
					doc.line(margin, 30.5, pageWidth - margin, 30.5);

					// Title
					doc.setFont("helvetica", "bold");
					doc.setFontSize(11);
					doc.text(sTypeLabel, pageWidth / 2, 37, { align: "center" });
					doc.setLineWidth(0.35);
					doc.line(pageWidth / 2 - titleW / 2, 38.5, pageWidth / 2 + titleW / 2, 38.5);

					// Info Grid Box (Outer Box + 2 Vertical Dividers)
					doc.setLineWidth(0.3);
					doc.rect(lColX, gridY, contentWidth, gridH);
					doc.line(mColX, gridY, mColX, gridY + gridH);
					doc.line(rColX, gridY, rColX, gridY + gridH);
					doc.setLineWidth(0.2);
					doc.line(lColX, gridY + 9, mColX, gridY + 9);

					// Left Column Info
					doc.setFontSize(8.5);
					doc.setFont("helvetica", "normal");
					doc.text("Please allow", lColX + pad, gridY + 6);
					doc.setFont("helvetica", "bold");
					var sPersonName = (oOut.VendorPerson || "").trim();
					if (sPersonName) {
						sPersonName = /^(mr|ms|mrs|mr\/ms)\.?\s+/i.test(sPersonName) ? sPersonName : "Mr/Ms. " + sPersonName;
					} else {
						sPersonName = "Mr/Ms.";
					}
					doc.text(sPersonName, lColX + 34, gridY + 6);
					doc.text(oOut.VendorName || "", lColX + pad, gridY + 14);
					doc.setFont("helvetica", "normal");
					doc.text(splitAddr, lColX + pad, gridY + 19.5);
					doc.setFont("helvetica", "italic");
					doc.setFontSize(8);
					doc.text("to take out the following material from MEIL premises.", lColX + pad, gridY + gridH - 3);

					// Middle Column Info (Metadata Col 1)
					var mc = mColX + pad, my = gridY + 5.5, mLblOff = 24;
					doc.setFontSize(8);
					doc.setFont("helvetica", "bold"); doc.text("Req. No:", mc, my);
					doc.setFont("helvetica", "normal"); doc.text(oOut.GatePassreqNo || oOut.GatePassReqNo || "", mc + mLblOff, my); my += 5.2;
					doc.setFont("helvetica", "bold"); doc.text("GP Type:", mc, my);
					doc.setFont("helvetica", "normal"); doc.text(sType, mc + mLblOff, my); my += 5.2;
					doc.setFont("helvetica", "bold"); doc.text("Department:", mc, my);
					doc.setFont("helvetica", "normal"); doc.text(oOut.Department || "", mc + mLblOff, my); my += 5.2;
					doc.setFont("helvetica", "bold"); doc.text("Vehicle No:", mc, my);
					doc.setFont("helvetica", "normal"); doc.text(oOut.VehicleNo || "", mc + mLblOff, my); my += 5.2;
					doc.setFont("helvetica", "bold"); doc.text("Vendor GST:", mc, my);
					doc.setFont("helvetica", "normal"); doc.text(oOut.VendorGST || "", mc + mLblOff, my);

					// Right Column Info (Metadata Col 2)
					var rc = rColX + pad, ry = gridY + 5.5, rLblOff = 27;
					var sReqName = oOut.Requestor || oOut.ReqUser || oOut.Requser || oOut.requser || oOut.RequestedUser || oOut.ReqEmpName || oOut.ReqName || oOut.RequestorName || oOut.CreatedBy || oOut.Createdby || oOut.Ernam || oOut.Uname || oOut.Username || "";
					if (!sReqName) {
						try {
							var oUserM = sap.ui.getCore().getModel("user");
							if (oUserM) {
								sReqName = oUserM.getProperty("/id") || oUserM.getProperty("/sUserId") || oUserM.getProperty("/User") || "";
							}
						} catch (e) {}
					}
					if (!sReqName) {
						try {
							var sLocalUser = localStorage.getItem("gpms_user");
							if (sLocalUser) {
								var oParsedUser = JSON.parse(sLocalUser);
								sReqName = oParsedUser.id || oParsedUser.sUserId || oParsedUser.User || "";
							}
						} catch (e) {}
					}
					doc.setFontSize(8);
					doc.setFont("helvetica", "bold"); doc.text("DC NO :", rc, ry);
					doc.setFont("helvetica", "normal"); doc.text(oOut.ChallanNumber || oOut.Challanumber || "", rc + rLblOff, ry); ry += 5.2;
					doc.setFont("helvetica", "bold"); doc.text("Requester name :", rc, ry);
					doc.setFont("helvetica", "normal"); doc.text(sReqName, rc + rLblOff, ry); ry += 5.2;
					doc.setFont("helvetica", "bold"); doc.text("LR NO :", rc, ry);
					doc.setFont("helvetica", "normal"); doc.text(oOut.LRNumber || oOut.LRNnumber || "", rc + rLblOff, ry); ry += 5.2;
					doc.setFont("helvetica", "bold"); doc.text("Transport name :", rc, ry);
					doc.setFont("helvetica", "normal"); doc.text(oOut.TransporterName || "", rc + rLblOff, ry);

					// Page Number
					doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
					doc.text("Page " + data.pageNumber, pageWidth - margin, pageHeight - 7, { align: "right" });
				}
			});

			var finalY = doc.lastAutoTable.finalY;

			// ── IN WORDS + TOTAL ROW ─────────────────────────────────────────────
			var footH = 9, totalColW = 64;
			doc.setLineWidth(0.25);
			doc.rect(margin, finalY, contentWidth, footH);
			doc.line(pageWidth - margin - totalColW, finalY, pageWidth - margin - totalColW, finalY + footH);
			doc.setFont("helvetica", "normal"); doc.setFontSize(8);
			doc.text("In Words :  Rupees " + this._numberToWords(Math.round(fTotal)) + " Only.", margin + 3, finalY + 5.5);
			doc.setFont("helvetica", "bold");
			doc.text("Total Value (Rs.)", pageWidth - margin - totalColW + 3, finalY + 5.5);
			doc.text(
				fTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
				pageWidth - margin - 3, finalY + 5.5, { align: "right" }
			);

			// ── REMARKS ROW ──────────────────────────────────────────────────────
			var remY = finalY + footH + 1, remH = 8;
			doc.setLineWidth(0.25);
			doc.rect(margin, remY, contentWidth, remH);
			doc.line(margin + 28, remY, margin + 28, remY + remH);
			doc.setFont("helvetica", "bold"); doc.setFontSize(8);
			doc.text("Remarks:", margin + 3, remY + 5);
			doc.setFont("helvetica", "normal");
			doc.text(doc.splitTextToSize(oOut.UserRemarks || "NIL", contentWidth - 33), margin + 31, remY + 5);

			// ── SIGNATURE SECTION ────────────────────────────────────────────────
			var sigHeaderY = remY + remH + 8;
			doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
			doc.text("For MEIL Neyveli Energy Private Limited", margin, sigHeaderY, { align: "left" });

			var sigLineY = sigHeaderY + 18;
			doc.setLineWidth(0.3);
			// Left: Authorised Signatory
			doc.line(margin, sigLineY, margin + 65, sigLineY);
			doc.text("Authorised Signatory", margin + 32.5, sigLineY + 5, { align: "center" });

			// Right: Receiver Signature
			doc.line(pageWidth - margin - 65, sigLineY, pageWidth - margin, sigLineY);
			doc.text("Receiver Signature", pageWidth - margin - 32.5, sigLineY + 5, { align: "center" });

			if (bGetBase64 === true) {
				return doc.output('datauristring').split(',')[1];
			}

			doc.save("GatePass_" + (oOut.GatePassNo || "Draft") + ".pdf");
			MessageToast.show("Gate Pass Printed");
			} catch (err) {
				console.error("[GPMS] Error in onPrintGatePass:", err);
				if (bGetBase64 !== true) {
					MessageBox.error("Failed to generate Gate Pass PDF: " + (err.message || err));
				}
			}
		},

		_sendBase64ToBackendSilently: function(sGPbase, sDCbase) {
			// PDF base64 is already persisted via onSaveLogistics into /OutGatePassSet
		},

		onSubmitOutgate: function () {
			var oOutModel = this.getView().getModel("out");
			var sApprovalStatus = oOutModel.getProperty("/ApprovalStatus") || "";

			// Amendment resubmission is allowed for any user role
			if (sApprovalStatus === "AMENDMENT") {
				this._resubmitAmendmentRequest();
				return;
			}

			// Gate pass generation is restricted to Store users
			var oUserModel = sap.ui.getCore().getModel("user");
			var bIsStoreUser = oUserModel ? oUserModel.getProperty("/IsStoreUser") : false;
			var bIsHodUser = oUserModel ? oUserModel.getProperty("/IsHodUser") : false;
			if (!bIsStoreUser && bIsHodUser) {
				sap.m.MessageBox.error("Only Store users are authorized to generate a Gate Pass.");
				return;
			}

			var oOut = oOutModel.getData();

						var fnFormatDate = function (oDate) {
				if (!oDate) return "";
				if (typeof oDate === "string") {
					var sClean = oDate.trim();
					if (sClean.length === 8 && !isNaN(sClean)) return sClean;
					if (/^\d{2}[-\/]\d{2}[-\/]\d{4}$/.test(sClean)) {
						return sClean.slice(6, 10) + sClean.slice(3, 5) + sClean.slice(0, 2);
					}
					if (/^\d{4}[-\/]\d{2}[-\/]\d{2}$/.test(sClean)) {
						return sClean.slice(0, 4) + sClean.slice(5, 7) + sClean.slice(8, 10);
					}
				}
				var d = (oDate instanceof Date) ? oDate : new Date(oDate);
				if (isNaN(d.getTime())) return "";
				var y = d.getFullYear();
				var m = String(d.getMonth() + 1).padStart(2, '0');
				var day = String(d.getDate()).padStart(2, '0');
				return y + m + day;
			};

			// Format today's date as YYYY-MM-DD
			var sToday = new Date().toISOString().split('T')[0];

			// Format Challan Date if exists, else today
			var sChallanDate = fnFormatDate(oOut.ChallanDate) || fnFormatDate(sToday);

			var oLogistics = {
				LRNnumber: oOut.LRNnumber || "",
				VehicleNo: oOut.VehicleNo || "",
				ModeOfTransport: oOut.ModeOfTransport || "",
				TransporterName: oOut.TransporterName || "",
				TransporterGST: oOut.TransporterGST || "",
				EWayBillNo: oOut.EWayBillNo || "",
				EWayBillDate: oOut.EWayBillDate || "",
				ChallanNumber: oOut.ChallanNumber || "",
				DCNotes: oOut.DCNotes || "",
				GPStatus: oOut.Status || "",
				VendorPerson: oOut.VendorPerson || "",
				CommonDesc: oOut.CommonDesc || "",
				HODRemarks: oOut.HODRemarks || "",
				StoreRemarks: oOut.StoreRemarks || oOut.STORERemarks || "",
				bInsured: !!oOut.InsuranceRequired,
				InsuranceRequired: !!oOut.InsuranceRequired,
				sInsAmount: oOut.InsuranceAmount || "",
				InsuranceAmount: oOut.InsuranceAmount || "",
				sInsDate: oOut.InsuranceDate || "",
				InsuranceDate: oOut.InsuranceDate || "",
				ReturnableDate: oOut.ReturnableDate || oOut.DueDate || "",
				ExtendedReturnableDate: oOut.ExtendedReturnableDate || oOut.ExtReturnDate || ""
			};
			var sHODOut = oOut.HODRemarks || "";
			var sStoreOut = oOut.StoreRemarks || oOut.STORERemarks || "";
			if (oOut.GatePassNo) {
				localStorage.setItem("logistics_" + String(oOut.GatePassNo).trim(), JSON.stringify(oLogistics));
				localStorage.setItem("gp_logistics_" + String(oOut.GatePassNo).trim(), JSON.stringify(oLogistics));
			}
			if (oOut.GatePassreqNo) {
				var sRKey = String(oOut.GatePassreqNo).trim();
				localStorage.setItem("logistics_" + sRKey, JSON.stringify(oLogistics));
				localStorage.setItem("gp_logistics_" + sRKey, JSON.stringify(oLogistics));
				if (sHODOut || sStoreOut) {
					try {
						localStorage.setItem("req_remarks_" + sRKey, JSON.stringify({ HODRemarks: sHODOut, StoreRemarks: sStoreOut }));
					} catch (e) {}
				}
			}

			var oPayload = {
				GatePassreqNo: oOut.GatePassreqNo || "",
				FiscalYear: oOut.FiscalYear || String(new Date().getFullYear()),
				Plant: oOut.Plant || "",
				GatePassType: oOut.GatePassType || "RGP",
				GatePassNo: oOut.GatePassNo || "",
				Vendor: oOut.Vendor || "",
				VendorName: oOut.VendorName,
				VendorGST: oOut.VendorGST,
				VendorPerson: oOut.VendorPerson,
				ZipCode: oOut.ZipCode || "",
				City: oOut.City || "",
				GatePassDate: sToday,
				// PurchasingDoc: oOut.PurchasingDoc || "",
				ChallanDate: sChallanDate,
				CommonDesc: oOut.CommonDesc || "",
				NoOfPacakages: parseInt(oOut.NoOfPackages || 0),
				Department: oOut.Department,
				Challanumber: oOut.ChallanNumber || "",
				GenerateDC: oOut.ChallanNumber ? "X" : "",
				VehicleNo: oOut.VehicleNo,
				ModeOfDispatch: oOut.ModeOfTransport,
				Remarks: oOut.UserRemarks,
				GPStatus: oOut.Status || "",
				TransporterName: oOut.TransporterName || "",
				TransporterGST: oOut.TransporterGST || "",
				DCNotes: oOut.DCNotes || "",
				InsuranceReq: oOut.InsuranceRequired ? "X" : "",
				InsuranceDate: oOut.InsuranceDate || "",
				InsuranceAmount: String(oOut.InsuranceAmount || "0"),
				Message: "",

				"OutgateNav": (oOut.items || []).map(function (it, index) {
					return {
						GatePassType: oOut.GatePassType || "RGP",
						GatePassNo: oOut.GatePassNo || "",
						ItemNo: String((index + 1) * 10).padStart(5, '0'),
						Material: it.material || "",
						MaterialDesc: it.materialName || it.hsnDesc || "",
						HSNCode: it.hsnCode || "",
						HSNDesc: it.hsnDesc || "",
						UOM: it.uom || "",
						ItemNetPrice: String(parseFloat(it.rate || 0).toFixed(2)),
						SentQuantity: String(parseFloat(it.sentQty || 0).toFixed(3)),
						RecievedQuantity: String(parseFloat(it.recvdQty || 0).toFixed(3)),
						BalanceQuantity: String(parseFloat(it.balQty || 0).toFixed(3)),
						Totalvalue: String(parseFloat(it.amount || 0).toFixed(2)),
						GatePassReqNo: oOut.GatePassreqNo || "",
						Remarks: it.itemRemarks || ""
					};
				})
			};

			var oODataModel = this.getModel();
			if (!oODataModel) {
				MessageBox.error("SAP system is not connected. Please contact your administrator.");
				return;
			}

			sap.ui.core.BusyIndicator.show(0);
			oODataModel.create("/OutGatePassSet", oPayload, {
				success: function (oData) {
					sap.ui.core.BusyIndicator.hide();
					
					// Backend might return 201 Created but actually fail/reject with a Message
					if (!oData.GatePassNo && oData.Message) {
						MessageBox.error(oData.Message);
						return;
					}

					var sGPNo = oData.GatePassNo || "Generated";

					// Update model with generated GP No and show logistics
					var oOutModel = this.getView().getModel("out");
					oOutModel.setProperty("/GatePassNo", sGPNo);
					oOutModel.setProperty("/showLogistics", true);

					var sMsg = "Gate Pass " + sGPNo + " generated successfully!\n\nThe Logistics & Printing section is now active below.";
					
					MessageBox.success(sMsg, {
						actions: [MessageBox.Action.OK, "Copy GP Number"],
						emphasizedAction: MessageBox.Action.OK,
						onClose: function (sAction) {
							if (sAction === "Copy GP Number") {
								navigator.clipboard.writeText(sGPNo).then(function() {
									sap.m.MessageToast.show("Gate Pass Number " + sGPNo + " copied!");
								});
							}
						}
					});
				}.bind(this),
				error: function (oError) {
					sap.ui.core.BusyIndicator.hide();
					var sMsg = "Error generating Gate Pass. Please check backend.";
					try {
						var oResp = JSON.parse(oError.responseText);
						sMsg = oResp.error.message.value;
					} catch (e) { }
					MessageBox.error(sMsg);
				}
			});
		},

		onSaveLogistics: async function (bIsGenerateDC) {
			var oOutModel = this.getView().getModel("out");
			var oOut = oOutModel.getData();
			var oODataModel = this.getModel();
			var that = this;

			if (!oOut.GatePassNo) {
				MessageBox.warning("Generate the Gate Pass first before saving logistics.");
				return;
			}

						var fnFormatDate = function (oDate) {
				if (!oDate) return "";
				if (typeof oDate === "string") {
					var sClean = oDate.trim();
					if (sClean.length === 8 && !isNaN(sClean)) return sClean;
					if (/^\d{2}[-\/]\d{2}[-\/]\d{4}$/.test(sClean)) {
						return sClean.slice(6, 10) + sClean.slice(3, 5) + sClean.slice(0, 2);
					}
					if (/^\d{4}[-\/]\d{2}[-\/]\d{2}$/.test(sClean)) {
						return sClean.slice(0, 4) + sClean.slice(5, 7) + sClean.slice(8, 10);
					}
				}
				var d = (oDate instanceof Date) ? oDate : new Date(oDate);
				if (isNaN(d.getTime())) return "";
				var y = d.getFullYear();
				var m = String(d.getMonth() + 1).padStart(2, '0');
				var day = String(d.getDate()).padStart(2, '0');
				return y + m + day;
			};

			sap.ui.core.BusyIndicator.show(0);

			var sGPbase = "";
			var sDCbase = "";
			if (oOut.GatePassNo) {
				try {
					sGPbase = await this.onPrintGatePass(true);
				} catch (e) { }
				if (oOut.ChallanNumber) {
					try {
						sDCbase = await this.onGenerateDC(true, true);
					} catch (e) { }
				}
			}

			// Save logistics/transporter details locally to prevent OData validation errors
			if (oOut.GatePassNo) {
				var oLogistics = {
					LRNnumber: oOut.LRNnumber || "",
					VehicleNo: oOut.VehicleNo || "",
					ModeOfTransport: oOut.ModeOfTransport || "",
					TransporterName: oOut.TransporterName || "",
					TransporterGST: oOut.TransporterGST || "",
					EWayBillNo: oOut.EWayBillNo || "",
					EWayBillDate: oOut.EWayBillDate || "",
					ChallanNumber: oOut.ChallanNumber || "",
					DCNotes: oOut.DCNotes || "",
					GPStatus: oOut.Status || "",
					VendorPerson: oOut.VendorPerson || "",
					CommonDesc: oOut.CommonDesc || ""
				};
				console.log("[GPMS Debug] onSaveLogistics: saving logistics =", oLogistics, "GPNo =", oOut.GatePassNo, "ReqNo =", oOut.GatePassreqNo);
				localStorage.setItem("logistics_" + String(oOut.GatePassNo).trim(), JSON.stringify(oLogistics));
				if (oOut.GatePassreqNo) {
					localStorage.setItem("logistics_" + String(oOut.GatePassreqNo).trim(), JSON.stringify(oLogistics));
				}
			}

			var sToday = fnFormatDate(new Date());
			var oPayload = {
				GatePassreqNo: oOut.GatePassreqNo || "",
				FiscalYear: oOut.FiscalYear || String(new Date().getFullYear()),
				Plant: oOut.Plant || "",
				GatePassNo: oOut.GatePassNo || "",
				Vendor: oOut.Vendor || "",
				VendorName: oOut.VendorName || "",
				VendorGST: oOut.VendorGST || "",
				VendorPerson: oOut.VendorPerson || "",
				ZipCode: oOut.ZipCode || "",
				City: oOut.City || "",
				GatePassDate: sToday,
				// PurchasingDoc: oOut.PurchasingDoc || "",
				ChallanDate: fnFormatDate(oOut.ChallanDate) || sToday,
				ReturnableDate: fnFormatDate(oOut.ReturnableDate) || "",
				ExtReturnDate: fnFormatDate(oOut.ExtendedReturnableDate) || "",
				CommonDesc: oOut.CommonDesc || "",
				NoOfPacakages: parseInt(oOut.NoOfPackages || 0),
				Department: oOut.Department || "",
				Challanumber: bIsGenerateDC === true ? "" : (oOut.ChallanNumber || ""),
				GenerateDC: bIsGenerateDC === true ? "X" : (oOut.ChallanNumber ? "X" : ""),
				GatePassType: oOut.GatePassType || "RGP",
				VehicleNo: oOut.VehicleNo || "",
				ModeOfDispatch: oOut.ModeOfTransport || "",
				Remarks: oOut.UserRemarks || "",
				GPStatus: oOut.Status || "",
				Message: "",
				GPbase64: sGPbase ? (sGPbase.split(',')[1] || sGPbase) : "",
				DCbase64: sDCbase ? (sDCbase.split(',')[1] || sDCbase) : "",
				LRNumber: oOut.LRNnumber || "",
				TransporterName: oOut.TransporterName || "",
				TransporterGST: oOut.TransporterGST || "",
				Comment1: "", Comment2: "", Comment3: "", Comment4: "", Comment5: "",
				Comment6: "", Comment7: "", Comment8: "", Comment9: "", Comment10: "",
				Sno1: "", Sno2: "", Sno3: "", Sno4: "", Sno5: "",
				Sno6: "", Sno7: "", Sno8: "", Sno9: "", Sno10: "",
				cdate1: "", cdate2: "", cdate3: "", cdate4: "", cdate5: "",
				cdate6: "", cdate7: "", cdate8: "", cdate9: "", cdate10: "",
				DCNotes: oOut.DCNotes || "",
				InsuranceReq: oOut.InsuranceRequired ? "X" : "",
				InsuranceDate: oOut.InsuranceDate || "",
				InsuranceAmount: String(oOut.InsuranceAmount || "0"),
				OutgateNav: (oOut.items || []).map(function (it, index) {
					return {
						GatePassType: oOut.GatePassType || "RGP",
						GatePassNo: oOut.GatePassNo || "",
						ItemNo: String((index + 1) * 10).padStart(5, "0"),
						Material: it.material || "",
						MaterialDesc: it.materialName || it.hsnDesc || "",
						HSNCode: it.hsnCode || "",
						HSNDesc: it.hsnDesc || "",
						UOM: it.uom || "",
						ItemNetPrice: String(parseFloat(it.rate || 0).toFixed(2)),
						SentQuantity: String(parseFloat(it.sentQty || 0).toFixed(3)),
						RecievedQuantity: String(parseFloat(it.recvdQty || 0).toFixed(3)),
						BalanceQuantity: String(parseFloat(it.balQty || 0).toFixed(3)),
						Totalvalue: String(parseFloat(it.amount || 0).toFixed(2)),
						GatePassReqNo: oOut.GatePassreqNo || "",
						Remarks: it.itemRemarks || ""
					};
				})
			};

			// Populate flat comment fields from CommentsList
			var aOutComments = oOut.CommentsList || [];
			for (var oci = 0; oci < 10; oci++) {
				var oOutC = aOutComments[oci];
				var oIdx = oci + 1;
				var sRawDate = oOutC ? (oOutC.date || "") : "";
				var sParts = sRawDate.split("-");
				var sFmtDate = (sParts.length === 3 && sParts[2].length === 4)
					? (sParts[2] + sParts[1] + sParts[0])
					: fnFormatDate(sRawDate);
				oPayload["Comment" + oIdx] = oOutC ? (oOutC.text || "") : "";
				oPayload["Sno"     + oIdx] = oOutC ? (oOutC.sno  || String(oIdx)) : "";
				oPayload["cdate"   + oIdx] = sFmtDate || "";
			}

			oODataModel.create("/OutGatePassSet", oPayload, {
				success: function (oData) {
					sap.ui.core.BusyIndicator.hide();
					
					var sDC = oData.Challanumber || oData.ChallanNumber || oData.ChallanNo || oData.Challan || "";
					if (!sDC) {
						sDC = "DC" + (oOut.GatePassNo || oOut.GatePassreqNo || new Date().getTime());
					}
					oOutModel.setProperty("/ChallanNumber", sDC);
					oOutModel.setProperty("/DocOptionIndex", 1);
					
					try {
						var sKeyLog = oOut.GatePassNo || oOut.GatePassreqNo || "";
						if (sKeyLog) {
							var oLogToSave = {
								bInsured: !!oOut.InsuranceRequired,
								InsuranceRequired: !!oOut.InsuranceRequired,
								VehicleNo: oOut.VehicleNo || "",
								LRNnumber: oOut.LRNumber || oOut.LRNnumber || "",
								LRNumber: oOut.LRNumber || oOut.LRNnumber || "",
								ChallanNumber: sDC || ""
							};
							localStorage.setItem("gp_logistics_" + sKeyLog, JSON.stringify(oLogToSave));
							localStorage.setItem("logistics_" + sKeyLog, JSON.stringify(oLogToSave));
						}
					} catch (eLog) {}

					var sMsg = oData.Message || ("Delivery Challan (" + sDC + ") Generated & Saved successfully!");
					if (bIsGenerateDC === true) {
						that.onGenerateDC(false, true);
					}
					MessageBox.success(sMsg, {
						onClose: function () {
							if (bIsGenerateDC === true) {
								// Ensure downloaded if popup had blocked it
								that.onGenerateDC(false, true);
							}
						}
					});
				},
				error: function (oError) {
					sap.ui.core.BusyIndicator.hide();
					var sMsg = "Error saving logistics details.";
					try {
						var oResp = JSON.parse(oError.responseText);
						sMsg = oResp.error.message.value;
					} catch (e) { }
					MessageBox.error(sMsg);
				}
			});
		},

		onCancelGatePass: function () {
			var oOutModel = this.getView().getModel("out");
			var sGPNo = oOutModel.getProperty("/GatePassNo");
			if (!sGPNo) {
				MessageBox.warning("No Gate Pass has been generated yet.");
				return;
			}

			MessageBox.confirm("Are you sure you want to cancel Gate Pass " + sGPNo + "?", {
				actions: [MessageBox.Action.YES, MessageBox.Action.NO],
				onClose: function (sAction) {
					if (sAction === MessageBox.Action.YES) {
						oOutModel.setProperty("/Status", "CANCELLED");
						this.onSaveLogistics();
					}
				}.bind(this)
			});
		},

		_getQRCodeBase64: function (sText) {
			return new Promise(function (resolve, reject) {
				try {
					var container = document.createElement("div");
					var qrcode = new QRCode(container, {
						text: sText,
						width: 256,
						height: 256
					});
					// Wait for it to render
					setTimeout(function () {
						var canvas = container.querySelector("canvas");
						if (canvas) {
							resolve(canvas.toDataURL("image/png"));
						} else {
							var img = container.querySelector("img");
							if (img && img.src) {
								resolve(img.src);
							} else {
								reject("Canvas not found");
							}
						}
					}, 100);
				} catch (e) {
					reject(e);
				}
			});
		},

		_getImageBase64: function (url) {
			return new Promise(function (resolve, reject) {
				var img = new Image();
				var timer = setTimeout(function () {
					img.onload = null;
					img.onerror = null;
					reject("Timeout loading image");
				}, 1000);
				img.crossOrigin = "Anonymous";
				img.onload = function () {
					clearTimeout(timer);
					var canvas = document.createElement('canvas');
					canvas.width = img.width;
					canvas.height = img.height;
					var ctx = canvas.getContext('2d');
					ctx.drawImage(img, 0, 0);
					resolve(canvas.toDataURL('image/png'));
				};
				img.onerror = function (err) {
					clearTimeout(timer);
					reject(err);
				};
				img.src = url;
			});
		},

		_numberToWords: function (num) {
			var a = ["", "One ", "Two ", "Three ", "Four ", "Five ", "Six ", "Seven ", "Eight ", "Nine ", "Ten ", "Eleven ", "Twelve ", "Thirteen ", "Fourteen ", "Fifteen ", "Sixteen ", "Seventeen ", "Eighteen ", "Nineteen "];
			var b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
			if ((num = (num || 0).toString()).length > 9) return "overflow";
			var n = ("000000000" + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
			if (!n) return "";
			var str = "";
			str += (n[1] != 0) ? (a[Number(n[1])] || b[n[1][0]] + " " + a[n[1][1]]) + "Crore " : "";
			str += (n[2] != 0) ? (a[Number(n[2])] || b[n[2][0]] + " " + a[n[2][1]]) + "Lakh " : "";
			str += (n[3] != 0) ? (a[Number(n[3])] || b[n[3][0]] + " " + a[n[3][1]]) + "Thousand " : "";
			str += (n[4] != 0) ? (a[Number(n[4])] || b[n[4][0]] + " " + a[n[4][1]]) + "Hundred " : "";
			str += (n[5] != 0) ? ((str !== "") ? "and " : "") + (a[Number(n[5])] || b[n[5][0]] + " " + a[n[5][1]]) : "";
			return str;
		},

		_applyVendorMasterData: function (v, oModel) {
			if (!v || !oModel) return;
			var sStreet = (v.Address || v.Street || v.Stras || "").trim();
			var sCity = (v.City || oModel.getProperty("/City") || "").trim();
			var sZip = (v.ZipCode || v.PostalCode || oModel.getProperty("/ZipCode") || "").trim();
			var sCountry = (v.Country || "").trim();

			var sCityLine = [sCity, sZip, sCountry].filter(Boolean).join(" ");
			var aLines = [];
			if (sStreet) { aLines.push(sStreet); }
			if (sCityLine) { aLines.push(sCityLine); }

			var sFormattedAddress = aLines.join("\n");
			if (!sFormattedAddress) {
				sFormattedAddress = [sStreet, sCity, sZip, sCountry].filter(Boolean).join(", ");
			}

			if (v.Name || v.VendorName) {
				oModel.setProperty("/VendorName", v.Name || v.VendorName);
			}
			if (v.VendorGST) {
				oModel.setProperty("/VendorGST", v.VendorGST);
			}

			oModel.setProperty("/Address", sStreet);
			oModel.setProperty("/City", sCity);
			oModel.setProperty("/ZipCode", sZip);
			oModel.setProperty("/Country", sCountry);
			if (sFormattedAddress) {
				oModel.setProperty("/VendorAddress", sFormattedAddress);
			}
		},

		_enrichVendorAddressMaster: function (sVendorCode, sPlant, oModel) {
			if (!sVendorCode || !oModel) return;
			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) return;

			var sRawVendor = String(sVendorCode).trim();
			var sPaddedVendor = sRawVendor;
			if (sPaddedVendor && /^\d+$/.test(sPaddedVendor) && sPaddedVendor.length < 10) {
				sPaddedVendor = sPaddedVendor.padStart(10, "0");
			}

			var sPlantFilter = sPlant || "2301";
			var that = this;

			oODataModel.read("/ZVendorSet", {
				filters: [
					new sap.ui.model.Filter("Vendor", sap.ui.model.FilterOperator.EQ, sPaddedVendor),
					new sap.ui.model.Filter("Plant", sap.ui.model.FilterOperator.EQ, sPlantFilter)
				],
				success: function (oData) {
					var aRes = oData.results || [];
					if (aRes.length > 0) {
						that._applyVendorMasterData(aRes[0], oModel);
					} else if (sPaddedVendor !== sRawVendor) {
						oODataModel.read("/ZVendorSet", {
							filters: [
								new sap.ui.model.Filter("Vendor", sap.ui.model.FilterOperator.EQ, sRawVendor),
								new sap.ui.model.Filter("Plant", sap.ui.model.FilterOperator.EQ, sPlantFilter)
							],
							success: function (oData2) {
								var aRes2 = oData2.results || [];
								if (aRes2.length > 0) {
									that._applyVendorMasterData(aRes2[0], oModel);
								}
							}
						});
					}
				}
			});
		}
	});
});


